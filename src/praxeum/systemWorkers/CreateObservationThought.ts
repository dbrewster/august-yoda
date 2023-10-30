import {CodeAgent, CodeAgentOptions} from "@/kamparas/CodeAgent"
import {HelpResponse, NewTaskInstruction} from "@/kamparas/Environment"
import {getOrCreateSchemaManager} from "@/kamparas/SchemaManager"
import {z} from "zod"
import {nanoid} from "nanoid";

export interface ObservationThoughtInput {
    observation_id: string,
    thoughts: string[]
}

export class CreateObservationThought extends CodeAgent {
    static TOOL_NAME="create_observation_thought"

    constructor(options: CodeAgentOptions) {
        super(options, {
            identifier: "alpha",
            job_description: `Records a thought related to an observation. The thoughts should be detailed and describe what are thinking or what you should do next`,
            input_schema: getOrCreateSchemaManager().compileZod(z.object({
                observation_id: z.string().describe("The observation id this thought is associated with"),
                thoughts: z.array(z.string().describe("A very detailed description of the thought you have made"))
            })),
            answer_schema: getOrCreateSchemaManager().compileZod(z.object({
                id: z.string().describe("Unique id for the thought")
            }))
        })
    }

    async exec(instruction: NewTaskInstruction, conversationId: string): Promise<void> {
        const thought = instruction.input as ObservationThoughtInput

        for (const thoughtString of thought.thoughts) {
            await this.memory.recordThought(instruction.helpee_title, instruction.helpee_id, instruction.helpee_conversation_id, thought.observation_id, thoughtString)
        }
        this.doAnswer(conversationId, instruction.request_id, {id: nanoid()})
    }

    processHelpResponse(response: HelpResponse, callContext: any): Promise<void> {
        return Promise.resolve(undefined)
    }
}