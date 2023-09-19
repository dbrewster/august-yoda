import {
  BaseCallContext,
  BaseItem,
  BaseNameDescriptionOptions,
  ItemValues,
  RunManger
} from "@/yoda/new-query/BaseItem.js";
import {HumanMessagePromptTemplate, MessagesPlaceholder, SystemMessagePromptTemplate} from "langchain/prompts";
import {ZodObject, ZodType} from "zod";
import {LLMResult} from "langchain/schema";
// @ts-ignore
import {zodToJsonSchema} from "zod-to-json-schema";
import {BaseMessage, FunctionMessage, InputValues} from "langchain/schema";
import {addMemoryMessage, getMemory} from "@/yoda/memory/YodaMemory.js";

export interface ToolItem {
  name: string
  description: string
  inputSchema: ZodType<ZodObject<any>>

  _call(runId: string, input: ItemValues, options: BaseCallContext, callback: RunManger | undefined): Promise<ItemValues>
}

export interface AgentOptions extends BaseNameDescriptionOptions {
  name: string
  description: string
  children: ToolItem[]
  outputValues: string[]
  finalAnswerKey: string
  humanMessage: string
  memoryContext?: string
  maxIterations?: number // defaults to 5
  agentMessage?: string
}

export class Agent extends BaseItem<AgentOptions> {
  readonly name: string;
  readonly description: string;

  agentMessage = SystemMessagePromptTemplate.fromTemplate(
    `Do your best to answer the questions.
Please plan out the steps you need to take first using the history of other queries by the user and the input parameters for the tools
Feel free to use any tools available to look up relevant information.
Take the following steps before calling a tool:
  1) Make sure the tool you are calling is the correct tool. If the use didn't ask a question related to the tool then don't ask the tool.
  2) The tools DO NOT have memory. You need to combine all prior questions from the user into a new question that the tool can answer before calling the tool
  
After you call a tool:
  1) Translate the response into a response according to the users request.
  2) If the tool didn't return any results, DO NOT try to answer the question yourself. You can call the tool again with a better request.
Note that a chain of tools may be required to answer the query.
Also note that if you have previous answers to the users question you may return those or reformat the answer in any way without calling a tool.
`
  )
  private humanMessage: HumanMessagePromptTemplate
  private readonly maxIterations: number

  constructor(props: AgentOptions) {
    super(props);
    this.name = props.name
    this.description = this.props.description
    if (props.agentMessage) {
      this.agentMessage = SystemMessagePromptTemplate.fromTemplate(props.agentMessage)
    }
    this.humanMessage = HumanMessagePromptTemplate.fromTemplate(props.humanMessage)
    this.maxIterations = props.maxIterations || 5
  }

  async call(runId: string, input: ItemValues, options: BaseCallContext, runManager?: RunManger): Promise<ItemValues> {
    let llmResultValue = {}

    const maybeAddMemory = async (message: BaseMessage) => {
      if (this.props.memoryContext) {
        await addMemoryMessage(options.userId, options.chatId, options.conversationId, this.props.memoryContext, message)
      }
    }

    let memoryMessages: BaseMessage[] = []
    if (this.props.memoryContext) {
      memoryMessages = await getMemory(options.userId, options.chatId, this.props.memoryContext)
    }
    const toolNameToToolMap = {} as Record<string, ToolItem>
    const tools = this.props.children.map(tool => {
      toolNameToToolMap[tool.name] = tool
      return {
        name: tool.name,
        description: tool.description,
        parameters: zodToJsonSchema(tool.inputSchema)
      }
    })

    let allValues = {...input}
    let messages = [
      this.agentMessage,
      this.humanMessage,
      new MessagesPlaceholder("agent_scratchpad"),
    ]

    runManager?.handleEvent(runId, "onStartAgent", {input:input, tools:tools})
    let stepsTaken = [] as BaseMessage[]
    let numIterations = 0
    let stepRunId = runId

    // add the first human message to memory
    await maybeAddMemory(await this.humanMessage.format(allValues))

    runManager?.handleEvent(stepRunId, "onAgentStart", {values:allValues})
    // This needs to be a loop where we go until the agent is finished with the query...
    // We need to populate the scratchpad with all the work that has been done so far
    while (numIterations < this.maxIterations) {
      stepRunId = `${runId}:${numIterations}`
      allValues.agent_scratchpad = stepsTaken
      let messagesForLLM = memoryMessages.concat((await Promise.all(messages.map(m => m.formatMessages(allValues)))).flat());

      runManager?.handleEvent(stepRunId, "onBeforeExecAgent", {messages:messagesForLLM})
      const llmResult: LLMResult = await options.model.generate([messagesForLLM], {
        functions: tools
      }).catch((reason) => {
        runManager?.handleEvent(stepRunId, "onErrorExecAgent", {error: reason.response ? reason.response.data : reason.message})
        console.error(reason.response ? reason.response.data : reason.message)
        return Promise.reject(reason.response ? reason.response.data : reason.message)
      })
      runManager?.handleEvent(stepRunId, "onAfterExecAgent", {result: llmResult})
      const generation = llmResult.generations[0][0] as Record<string, any>
      stepsTaken = stepsTaken.concat(generation.message)
      // add the AI response
      maybeAddMemory(generation.message)

      if (generation.message.additional_kwargs.function_call) {
        const functionName = generation.message.additional_kwargs.function_call.name
        const returnArgs = generation.message.additional_kwargs.function_call.arguments as string

        let tool = toolNameToToolMap[functionName];
        llmResultValue = tool.inputSchema.parse(JSON.parse(returnArgs)) as Record<string, any>
        runManager?.handleEvent(stepRunId, "onAgentCallToolStart", {tool:tool, args: llmResultValue})

        const response = await tool._call(stepRunId, llmResultValue, options, runManager)
        runManager?.handleEvent(stepRunId, "onAgentCallToolEnd", {tool: tool, response:response})

        let functionMessage = new FunctionMessage({content: JSON.stringify(response), name: functionName});
        // add the tool call response
        maybeAddMemory(functionMessage)
        stepsTaken = stepsTaken.concat(functionMessage)

        allValues = {...allValues, ...response}
        ++numIterations
      } else {
        // we are done...
        allValues[this.props.finalAnswerKey] = generation.message.content
        allValues = this.props.outputValues.reduce((ret, outkey) => {
          ret[outkey] = allValues[outkey]
          return ret
        }, {} as InputValues)

        runManager?.handleEvent(stepRunId, "onAgentEnd", {response: allValues})
        break
      }
    }
    // end loop

    return allValues
  }
}
