import {LLM, LLMExecuteOptions, LLMResult} from "@/kamparas/LLM";
import {EpisodicEvent} from "@/kamparas/Memory";
import {AgentTool} from "@/kamparas/Agent";
import OpenAI, {ClientOptions} from "openai";
import {ChatCompletionMessageParam} from "openai/resources/chat";
import JSON5 from "json5";
import {HelpResponse} from "@/kamparas/Environment";

const FUNCTION_START = "```START```"
const FUNCTION_END = "```END```"

export class OpenAILLM extends LLM {
    private openai: OpenAI;

    constructor(options: ClientOptions) {
        super();
        this.openai = new OpenAI(options)
    }

    async execute(options: LLMExecuteOptions, events: EpisodicEvent[]): Promise<LLMResult> {
        let messages = this.formatMessages(events);
        console.log("openai messages", JSON.stringify(messages, null, 2))
        const response = await this.openai.chat.completions.create({
            messages: messages,
            ...options
        })

        console.log("got response", JSON.stringify(response, null, 2))
        const message = response.choices[0].message.content || ""
        const executeResponse: LLMResult = {
            thoughts: []
        }
        let functionStart = message.indexOf(FUNCTION_START);
        console.log("fn start", functionStart)
        if (functionStart >= 0) {
            const functionEnd = message.indexOf(FUNCTION_END, functionStart + FUNCTION_START.length)
            let functionCallStr = message.slice(functionStart + FUNCTION_START.length, functionEnd);
            console.log("fn ", functionCallStr)
            const functionCall = JSON5.parse(functionCallStr)
            if (!functionCall || !functionCall.tool_name || !functionCall.arguments) {
                return Promise.reject("Invalid function call in response:" + functionCallStr)
            }
            console.log("fn ", functionCall)
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

Example:
${FUNCTION_START}{
  tool_name: "report_answer",
  arguments: {
    result: "here is the answer to your question..."
  }
}${FUNCTION_END}
`
    }

    private formatMessages(events: EpisodicEvent[]) {
        return events.filter(e => e.type !== "task_start").map(event => {
            if (event.actor !== "worker") {
                throw Error("Invalid message actor type")
            }
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
                case "help":
                case "thought":
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
        })
    }
}
