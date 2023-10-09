import {LLM, LLMExecuteOptions, LLMResult} from "@/kamparas/LLM";
import {EpisodicEvent} from "@/kamparas/Memory";
import {AgentIdentifier} from "@/kamparas/Agent";
import OpenAI, {ClientOptions} from "openai";
import {ChatCompletionMessageParam} from "openai/resources/chat";
import {zodToJsonSchema} from "zod-to-json-schema";

const FUNCTION_START = "tool_call```"
const FUNCTION_END = "```"

export class OpenAILLM extends LLM {
    private openai: OpenAI;

    constructor(options: ClientOptions) {
        super();
        this.openai = new OpenAI(options)
    }

    async execute(options: LLMExecuteOptions, events: EpisodicEvent[]): Promise<LLMResult> {
        const response = await this.openai.chat.completions.create({
            messages: this.formatMessages(events),
            ...options
        })

        const message = response.choices[0].message.content || ""
        const executeResponse: LLMResult = {
            thoughts: []
        }
        let functionStart = message.indexOf(FUNCTION_START);
        if (functionStart >= 0) {
            const functionEnd = message.indexOf(FUNCTION_END, functionStart + FUNCTION_START.length)
            let functionCallStr = message.slice(functionStart + FUNCTION_START.length, functionEnd);
            const functionCall = JSON.parse(functionCallStr)
            if (!functionCall || !functionCall.title || !functionCall.content) {
                return Promise.reject("Invalid function call in response:" + functionCallStr)
            }
            executeResponse.helperCall = functionCall
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

    formatHelpers(availableHelpers: AgentIdentifier[]): string {
        return `You can choose from one of the following tools to help you:\n` +
            availableHelpers.map(helper => {
                return `{
    name: ${helper.title},
    description: ${helper.job_description}, 
    schema: ${JSON.stringify(zodToJsonSchema(helper.input_schema))
                }\n`
            }) + `

To call a tool the format of the call MUST be:
${FUNCTION_START}{
  tool_name: "The name of the tool to call",
  arguments: "The arguments to the tool. The arguments must match the schema given in the tool definition"
}${FUNCTION_END}
`
    }

    private formatMessages(events: EpisodicEvent[]) {
        return events.map(event => {
            if (event.actor !== "worker") {
                throw Error("Invalid message actor type")
            }
            let role = ""
            switch (event.type) {
                case "plan":
                    role = "system"
                    break
                case "instruction":
                    role = "user"
                    break
                case "help":
                case "thought":
                    role = "assistant"
                    break
                case "response":
                    role = "function"
            }

            return ({role: role, content: JSON.stringify(event.content)} as ChatCompletionMessageParam)
        })
    }
}
