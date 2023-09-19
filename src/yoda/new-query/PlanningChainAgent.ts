import {
  BaseCallContext,
  BaseItem,
  BaseNameDescriptionItem,
  BaseNameDescriptionOptions,
  ItemValues,
  RunManger
} from "@/yoda/new-query/BaseItem.js";
import {BaseMessage, FunctionMessage, InputValues, LLMResult} from "langchain/schema";
import {HumanMessagePromptTemplate, SystemMessagePromptTemplate} from "langchain/prompts";
import {addMemoryMessage, getMemory} from "@/yoda/memory/YodaMemory.js";
import {zodToJsonSchema} from "zod-to-json-schema";
import {ToolItem} from "@/yoda/new-query/Agent.js";

interface PlanningChainAgentOptions extends BaseNameDescriptionOptions {
  children: (BaseItem & ToolItem)[]
  humanMessage: string
  outputValues: string[]
  memoryContext?: string
  maxIterations?: number // defaults to 5
  agentMessage?: string
}

export class PlanningChainAgent extends BaseNameDescriptionItem<PlanningChainAgentOptions> {

  agentMessage = SystemMessagePromptTemplate.fromTemplate(
    `You are a planning agent designed to find the entry point into a sequential chain of tools.
Each tool performs a specific action to produce a single answer.
The tools MUST be run in sequential order; however, the starting point can vary based on the input and history.
The tools available to you are:
{tools}
First give a reason why you chose this tool to start with
Next call the tool with the appropriate input
`
  )
  private readonly humanMessage: HumanMessagePromptTemplate

  constructor(props: PlanningChainAgentOptions) {
    super(props);
    if (props.agentMessage) {
      this.agentMessage = SystemMessagePromptTemplate.fromTemplate(props.agentMessage)
    }
    this.humanMessage = HumanMessagePromptTemplate.fromTemplate(props.humanMessage)
    if (!props.maxIterations) {
      this.props.maxIterations = 5
    }
  }

  async call(runId: string, input: ItemValues, options: BaseCallContext, runManager?: RunManger): Promise<ItemValues> {
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

    let messages = [
      this.agentMessage,
      this.humanMessage,
    ]

    runManager?.handleEvent(runId, "onStartPlanningChainAgent", {input: input, tools: tools})

    // add the first human message to memory
    await maybeAddMemory(await this.humanMessage.format(input))

    let messagesForLLM = memoryMessages.concat((await Promise.all(messages.map(m => m.formatMessages(input)))).flat());

    runManager?.handleEvent(runId, "onBeforeExecPlanningChainAgentCreatePlain", {messages: messagesForLLM})
    const llmResult: LLMResult = await options.model.generate([messagesForLLM], {
      functions: tools
    }).catch((reason) => {
      console.trace("ere")

      runManager?.handleEvent(runId, "onErrorExecPlanningChainAgentCreatePlain", {error: reason.response ? reason.response.data : reason.message})
      console.error(reason.response ? reason.response.data : reason.message)
      return Promise.reject(reason.response ? reason.response.data : reason.message)
    })
    console.log("here")
    const generation = llmResult.generations[0][0] as Record<string, any>
    // add the AI response
    await maybeAddMemory(generation.message)

    let chainEntryPoint = null
    const logEvent: Record<string, any> = {
      result: llmResult
    }
    if (generation.message.additional_kwargs.function_call) {
      const functionName = generation.message.additional_kwargs.function_call.name
      const returnArgs = generation.message.additional_kwargs.function_call.arguments as string
      const childIndex = this.props.children.findIndex(t => t.name == functionName)

      if (childIndex != -1) {
        let tool = toolNameToToolMap[functionName];
        const llmResultValue = tool.inputSchema.parse(JSON.parse(returnArgs)) as Record<string, any>
        logEvent.childIndex = childIndex
        logEvent.toolArgs = llmResultValue
        chainEntryPoint = {index: childIndex, callArgs: llmResultValue}
      }
    }
    runManager?.handleEvent(runId, "onAfterExecPlanningChainAgentCreatePlain", logEvent)
    let previous_error: string | null = null
    let numIterations = 0
    let allValues = {...input}
    while (numIterations < this.props.maxIterations!) {
      allValues = {...input}
      let childIndex = 0
      if (chainEntryPoint) {
        childIndex = chainEntryPoint.index
        allValues = {...allValues, ...chainEntryPoint.callArgs}
        chainEntryPoint = null
      }
      if (previous_error) {
        allValues = {...allValues, previous_error: previous_error}
        previous_error = null
      }
      console.log(childIndex)
      const childRunId = runId + ":" + numIterations
      for (let index = childIndex; index < this.props.children.length; index++) {
        const item = this.props.children[index]
        // super important to wait on each item as they need to be called serially and not in parallel
        try {
          const output = await item._call(childRunId, {...allValues}, options, runManager)
          let functionMessage = new FunctionMessage({content: JSON.stringify(output), name: item.name});
          await maybeAddMemory(functionMessage)
          allValues = {...allValues, ...output}
        } catch (e: any) {
          previous_error = e.toString()
          break
        }
      }
      if (previous_error) {
        ++numIterations
      } else {
        break
      }
    }

    const returnValues = this.props.outputValues.reduce((ret, outkey) => {
      ret[outkey] = allValues[outkey]
      return ret
    }, {} as InputValues)

    runManager?.handleEvent(runId, "onAfterPlanningChainAgent", {return: returnValues})
    return returnValues
  }
}