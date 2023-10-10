import {
    BaseCallContext,
    BaseChatCallContext,
    BaseItem,
    BaseNameDescriptionOptions,
    ItemValues,
    RunManger
} from "@/util/llm/BaseItem";
import {HumanMessagePromptTemplate, MessagesPlaceholder, SystemMessagePromptTemplate} from "langchain/prompts";
import {z, ZodObject, ZodSchema, ZodType} from "zod";
import {BaseMessage, FunctionMessage, InputValues, LLMResult} from "langchain/schema";
// @ts-ignore
import {zodToJsonSchema} from "zod-to-json-schema";
import {addMemoryMessage, getMemory} from "@/util/llm/YodaMemory";
import {ChatOpenAI} from "langchain/chat_models/openai";

export interface ToolItem {
    name: string
    description: string
    inputSchema: ZodType<ZodObject<any>>
    shouldHalt?: () => boolean
    thoughtOrObservation?: boolean

    _call(runId: string, input: ItemValues, options: BaseCallContext, callback: RunManger | undefined): Promise<ItemValues>
}

export interface AgentOptions extends BaseNameDescriptionOptions {
    name: string
    description: string
    children: ToolItem[]
    outputValues: string[]
    humanMessage: string
    memoryContext?: string
    maxIterations?: number // defaults to 5
    agentMessage?: string
    agentMessageSuffix?: string
    humanMessageSuffix?: string
    outputSchema?: ZodSchema
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

    agentMessageSuffix = SystemMessagePromptTemplate.fromTemplate(``)

    humanMessageSuffix = HumanMessagePromptTemplate.fromTemplate('\nPlan out how you are going to answer the question on each step.\n' +
        'Think about how each tool will help in answering the question. Be specific in your thought process and write your results in the content section of the response. Make sure you include your thoughts when calling a tool.\n' +
        '')

    outputSchema: ZodSchema = z.object({
        result: z.string().describe("The final answer")
    })
    private humanMessage: HumanMessagePromptTemplate
    private readonly maxErrors: number

    constructor(props: AgentOptions) {
        super(props);
        this.name = props.name
        this.description = this.props.description
        if (props.agentMessage) {
            this.agentMessage = SystemMessagePromptTemplate.fromTemplate(props.agentMessage)
        }
        if (props.agentMessageSuffix) {
            this.agentMessageSuffix = SystemMessagePromptTemplate.fromTemplate(props.agentMessageSuffix)
        }

        if (props.outputSchema) {
            this.outputSchema = props.outputSchema
        }
        this.humanMessage = HumanMessagePromptTemplate.fromTemplate(props.humanMessage + "\n" + "You may return text for intermediate thoughts but not for a function call")
        if (props.humanMessageSuffix) {
            this.humanMessageSuffix = HumanMessagePromptTemplate.fromTemplate(props.humanMessageSuffix)
        }
        this.maxErrors = props.maxIterations || 5
    }

    async beforeLLM(input: ItemValues, callOptions: BaseCallContext): Promise<ItemValues> {
        return input
    }

    async afterLLM(input: ItemValues): Promise<ItemValues> {
        return input
    }

    modelToUse(options: BaseCallContext): ChatOpenAI {
        return options.model
    }

    async call(runId: string, beforeInput: ItemValues, options: BaseChatCallContext, runManager?: RunManger): Promise<ItemValues> {
        let llmResultValue = {}
        const input = await this.beforeLLM(beforeInput, options)

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
        const rawTools = this.props.children.concat(new ThoughtStep(), new FinalThoughtStep(this.outputSchema))
        const tools = rawTools.map(tool => {
            toolNameToToolMap[tool.name] = tool
            return {
                name: tool.name,
                description: tool.description + (tool.thoughtOrObservation ? "" : " -- This tool is an action"),
                parameters: zodToJsonSchema(tool.inputSchema)
            }
        })

        let allValues = {...input}
        let messages = [
            this.agentMessage,
            this.agentMessageSuffix,
            this.humanMessage,
            this.humanMessageSuffix,
            new MessagesPlaceholder("agent_scratchpad"),
        ]

        runManager?.handleEvent(runId, "onStartAgent", {input: input, tools: tools})
        let stepsTaken = [] as BaseMessage[]
        let numErrors = 0
        let stepNumber = 0
        let stepRunId = runId

        // add the first human message to memory
        await maybeAddMemory(await this.humanMessage.format(allValues))

        runManager?.handleEvent(stepRunId, "onAgentStart", {values: allValues})
        // This needs to be a loop where we go until the agent is finished with the query...
        // We need to populate the scratchpad with all the work that has been done so far
        while (numErrors < this.maxErrors) {
            stepRunId = `${runId}:${stepNumber}`
            allValues.agent_scratchpad = stepsTaken
            let messagesForLLM = memoryMessages.concat((await Promise.all(messages.map(m => m.formatMessages(allValues)))).flat());
            runManager?.handleEvent(stepRunId, "onBeforeExecAgent", {messages: messagesForLLM})
            const llmResult: LLMResult = await this.modelToUse(options).generate([messagesForLLM], {
                functions: tools
            }).catch((reason) => {
                runManager?.handleEvent(stepRunId, "onErrorExecAgent", {error: reason.response ? reason.response.data : reason.message})
                console.error(reason.response ? reason.response.data : reason.message)
                return Promise.reject(reason.response ? reason.response.data : reason.message)
            })
            const generation = llmResult.generations[0][0] as Record<string, any>
            // console.log("***", JSON.stringify(generation, null, 2))
            stepsTaken = stepsTaken.concat(generation.message)
            // add the AI response
            maybeAddMemory(generation.message)

            if (generation.message.additional_kwargs.function_call) {
                const functionName = generation.message.additional_kwargs.function_call.name
                const returnArgs = generation.message.additional_kwargs.function_call.arguments as string
                let args = JSON.parse(returnArgs);
                runManager?.handleEvent(stepRunId, "onAfterExecAgent", {
                    generationInfo: llmResult.llmOutput,
                    content: generation.message.content,
                    functionName: functionName,
                    parameters: args
                })

                let tool = toolNameToToolMap[functionName];
                if (!tool) {
                    let functionMessage = new FunctionMessage({content: `Invalid tool name ${functionName}.  Did you call the wrong function?`, name: functionName});
                    ++numErrors
                    stepsTaken = stepsTaken.concat(functionMessage)
                } else {
                    llmResultValue = tool.inputSchema.parse(args) as Record<string, any>
                    runManager?.handleEvent(stepRunId, "onAgentCallToolStart", {tool: tool, args: llmResultValue})

                    const response = await tool._call(stepRunId, llmResultValue, options, runManager)
                    runManager?.handleEvent(stepRunId, "onAgentCallToolEnd", {tool: tool, response: response})

                    let functionMessage = new FunctionMessage({content: JSON.stringify(response), name: functionName});
                    // add the tool call response
                    maybeAddMemory(functionMessage)
                    stepsTaken = stepsTaken.concat(functionMessage)
                    allValues = {...allValues, ...response}
                    if (tool.shouldHalt && tool.shouldHalt()) {
                        break
                    }
                }
            } else {
                // The agent is thinking. Just let it go...
                runManager?.handleEvent(stepRunId, "onAfterExecAgent", {
                    generationInfo: llmResult.llmOutput,
                    content: generation.message.content,
                })
            }
            ++stepNumber
        }
        // end loop

        allValues = await this.afterLLM(allValues)
        allValues = this.props.outputValues.reduce((ret, outkey) => {
            ret[outkey] = allValues[outkey]
            return ret
        }, {} as InputValues)
        runManager?.handleEvent(stepRunId, "onAgentEnd", {response: allValues})
        return allValues
    }
}

class ThoughtStep extends BaseItem implements ToolItem {
    readonly name: string = "thought_or_observation"
    readonly description: string = "Records a very detailed thought or observation you might have."
    inputSchema: ZodType = z.object({
        observation: z.string().describe("A very detailed observation. This should include detailed observations on the action or thought that just occured"),
        thought: z.string().describe("A very detailed thought. This should include your detailed thoughts on what you should do next."),
    })

    call(runId: string, input: ItemValues, options: BaseCallContext, runManager: RunManger | undefined): Promise<ItemValues> {
        return Promise.resolve({result: "Thought recorded"});
    }

    thoughtOrObservation = true
}

class FinalThoughtStep extends BaseItem implements ToolItem {
    constructor(outputSchema: ZodSchema) {
        super();
        this.inputSchema = outputSchema;
    }

    readonly name: string = "final_answer"
    readonly description: string = "Call this function at the end after you have figured out the final answer."
    inputSchema: ZodSchema

    async call(runId: string, input: ItemValues, options: BaseCallContext, runManager: RunManger | undefined): Promise<ItemValues> {
        return input;
    }

    shouldHalt() {
        return true
    }
}
