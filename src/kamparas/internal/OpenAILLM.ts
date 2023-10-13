import {LLM, LLMExecuteOptions, LLMResult, ModelType} from "@/kamparas/LLM";
import {EpisodicEvent} from "@/kamparas/Memory";
import {AgentTool, final_answer_tool} from "@/kamparas/Agent";
import OpenAI from "openai";
import {ChatCompletionMessageParam} from "openai/resources/chat";
import JSON5 from "json5";
import {HelpResponse} from "@/kamparas/Environment";
import {getOrCreateSchemaManager} from "@/kamparas/SchemaManager";
import {z} from "zod";

abstract class BaseOpenAILLM extends LLM {
    protected openai: OpenAI;
    private readonly model: ModelType;
    private readonly temperature: number;

    constructor(model: ModelType, temperature: number) {
        super();
        this.model = model;
        this.temperature = temperature;
        this.openai = new OpenAI({})
    }

    async sendRequest(events: EpisodicEvent[], conversationId: string, options: LLMExecuteOptions) {
        let messages = this.formatMessages(events);
        if (this.logger.isDebugEnabled()) {
            this.logger.debug(`calling llm with messages ${JSON.stringify(messages, null, 2)}`, {conversation_id: conversationId})
        }
        const inOptions = {
            messages: messages,
            ...options,
            model: this.model,
            temperature: this.temperature
        }
        const response = await this.openai.chat.completions.create(inOptions)

        if (this.logger.isDebugEnabled()) {
            this.logger.debug(`Got response from llm ${JSON.stringify(response, null, 2)}`, {conversation_id: conversationId})
        } else {
            this.logger.info(`Got response from llm. Used ${JSON.stringify(response.usage)} tokens.`, {conversation_id: conversationId})
        }
        return response;
    }

    private formatMessages(events: EpisodicEvent[]) {
        return events.filter(e => e.type !== "task_start").map(event => {
            if (event.actor !== "worker") {
                throw Error("Invalid message actor type")
            }
            return this.formatMessage(event);
        })
    }

    formatMessage(event: EpisodicEvent) {
        let response: ChatCompletionMessageParam
        switch (event.type) {
            case "plan":
                response = {
                    role: "system",
                    content: typeof event.content === 'string' ? event.content : JSON.stringify(event.content)
                }
                break
            case "instruction":
                response = {
                    role: "user",
                    content: typeof event.content === 'string' ? event.content : JSON.stringify(event.content)
                }
                break
            case "hallucination":
                response = {
                    role: "user",
                    content: typeof event.content === 'string' ? event.content : JSON.stringify(event.content)
                }
                break
            case "help":
                response = {
                    role: "assistant",
                    content: FUNCTION_START + JSON.stringify(event.content) + FUNCTION_END,
                }
                break
            case "llm_error":
                response = {
                    role: "user",
                    content: typeof event.content === 'string' ? event.content : JSON.stringify(event.content)
                }
                break

            case "thought":
                response = {
                    role: "assistant",
                    content: typeof event.content === 'string' ? event.content : JSON.stringify(event.content)
                }
                break
            case "observation":
                response = {
                    role: "assistant",
                    content: typeof event.content === 'string' ? event.content : JSON.stringify(event.content)
                }
                break
            default:
                const msg = event.content as any as HelpResponse
                response = {
                    role: "function",
                    name: msg.helper_title,
                    content: JSON.stringify(msg.response)
                }
        }

        return response
    }
}

export class OpenAIFunctionsLLM extends BaseOpenAILLM {
    private functions?: any
    thought_and_observation_tool = {
        title: "thought_or_observation",
        job_description: "Records a very detailed thought or observation you might have.",
        input_schema: getOrCreateSchemaManager().compileZod(z.object({
            observation: z.string().describe("A very detailed observation. This should include detailed observations on the action or thought that just occured"),
            thought: z.string().describe("A very detailed thought. This should include your detailed thoughts on what you should do next."),
        }))
    } as AgentTool

    async execute(options: LLMExecuteOptions, conversationId: string, events: EpisodicEvent[]): Promise<LLMResult> {
        const optionsWithFunctions = {...options, functions: this.functions}
        const response = await this.sendRequest(events, conversationId, optionsWithFunctions);
        let choice = response.choices[0];
        const message = choice.message.content || ""
        const executeResponse: LLMResult = {
            thoughts: [],
            observations: []
        }
        if (message && message.length) {
            executeResponse.thoughts.push(message)
        }
        if (choice.message.function_call) {
            let args: any
            try {
                args = JSON5.parse(choice.message.function_call.arguments)
            } catch (e) {
                throw new Error(`Error parsing return function arguments: ${e}`)
            }
            if (!args) {
                this.logger.warn(`invalid function call arguments from llm: ${choice.message.function_call.arguments}`, {conversation_id: conversationId})
                return Promise.reject("Invalid function call in response:" + choice.message.function_call.arguments)
            }
            if (choice.message.function_call.name === this.thought_and_observation_tool.title) {
                executeResponse.observations.push(args.observation)
                executeResponse.thoughts.push(args.thought)
            } else {
                executeResponse.helperCall = {
                    title: choice.message.function_call.name,
                    content: args
                }
                if (this.logger.isDebugEnabled()) {
                    this.logger.debug(`LLM called tool ${executeResponse.helperCall.title} with args ${choice.message.function_call.arguments}`, {conversation_id: conversationId})
                }
            }
        }
        return Promise.resolve(executeResponse);
    }

    formatHelpers(availableHelpers: AgentTool[]): string | undefined {
        this.functions = availableHelpers.concat(this.thought_and_observation_tool).map(helper => {
            return {
                name: helper.title,
                description: helper.job_description,
                parameters: helper.input_schema.schema as Record<string, any>
            }
        })
        return `You have the following tools available to you:
        [${availableHelpers.map(t => t.title).join(",")}]
        
        Return an appropriate negative response (an empty object or "I don't know") if you cannot answer the question or are not making progress`
    }

    formatMessage(event: EpisodicEvent): ChatCompletionMessageParam {
        if (event.type === "help") {
            const helperCall = event.content as Record<string, any>
            return {
                role: "assistant",
                content: "",
                function_call: {
                    name: helperCall.tool_name,
                    arguments: JSON.stringify(helperCall.arguments)
                }
            }
        }
        return super.formatMessage(event);
    }
}

const FUNCTION_START = "```START```"
const FUNCTION_END = "```END```"

export class OpenAITextFunctionsLLM extends BaseOpenAILLM {

    async execute(options: LLMExecuteOptions, conversationId: string, events: EpisodicEvent[]): Promise<LLMResult> {
        const response = await this.sendRequest(events, conversationId, options);
        const message = response.choices[0].message.content || ""
        const executeResponse: LLMResult = {
            thoughts: [],
            observations: []
        }
        let functionStart = message.indexOf(FUNCTION_START);
        if (functionStart >= 0) {
            const functionEnd = message.indexOf(FUNCTION_END, functionStart + FUNCTION_START.length)
            let functionCallStr = message.slice(functionStart + FUNCTION_START.length, functionEnd);
            const functionCall = JSON5.parse(functionCallStr)
            if (!functionCall || !functionCall.tool_name || !functionCall.arguments) {
                this.logger.warn(`invalid function call string from llm: ${functionCallStr}`, {conversation_id: conversationId})
                return Promise.reject("Invalid function call in response:" + functionCallStr)
            }
            if (this.logger.isDebugEnabled()) {
                this.logger.debug(`LLM called tool ${functionCall.tool_name} with args ${JSON.stringify(functionCall.arguments)}`, {conversation_id: conversationId})
            }
            executeResponse.helperCall = {
                title: functionCall.tool_name,
                content: functionCall.arguments
            }
            if (functionStart > 0) {
                const firstThought = message.slice(0, functionStart).trim()
                if (firstThought.length) {
                    executeResponse.thoughts.push(firstThought)
                }
            }
            const lastThought = message.slice(functionEnd + FUNCTION_END.length).trim()
            if (lastThought.length) {
                executeResponse.thoughts.push(lastThought)
            }
        } else {
            const thought = message.trim()
            if (thought.length) {
                executeResponse.thoughts.push(thought)
            }
        }

        return Promise.resolve(executeResponse);
    }

    formatHelpers(availableHelpers: AgentTool[]): string {
        return `You can use the following tools:\n` +
            availableHelpers.map(helper => {
                return `{
    name: ${helper.title},
    description: ${helper.job_description}, 
    schema: ${JSON.stringify(helper.input_schema.schema)
                }\n`
            }) + `

To call a tool the format of the call MUST be:
${FUNCTION_START}{
  tool_name: "$name", // The name of the tool to call
  arguments: "$arg" // The arguments to the tool. The arguments must match the schema given in the tool definition
}${FUNCTION_END}


At each step consider if you know the final answer. You MUST use the ${final_answer_tool.title} tool to return the final answer.
`
    }

}

