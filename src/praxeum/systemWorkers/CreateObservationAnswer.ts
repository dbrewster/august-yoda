import {CodeAgent, CodeAgentOptions} from "@/kamparas/CodeAgent"
import {HelpResponse, NewTaskInstruction} from "@/kamparas/Environment"
import {getOrCreateSchemaManager} from "@/kamparas/SchemaManager"
import {z} from "zod"

export interface CreateObservationAnswerInput {
    observation_id: string,
    answer: string
}

export class CreateObservationAnswer extends CodeAgent {
    static TOOL_NAME="create_observation_answer"

    constructor(options: CodeAgentOptions) {
        super(options, {
            identifier: "alpha",
            job_description: `Records the answer related to an observation. The answer should be very detailed and express something that can be reflected on later.`,
            input_schema: getOrCreateSchemaManager().compileZod(z.object({
                observation_id: z.string().describe("The observation id this thought is associated with"),
                answer: z.string().describe("A very detailed answer to the observation")
            })),
            answer_schema: getOrCreateSchemaManager().compileZod(z.object({}))
        })
    }

    async exec(instruction: NewTaskInstruction, conversationId: string): Promise<void> {
        const answer = instruction.input as CreateObservationAnswerInput
        await this.memory.recordObservationAnswer(instruction.helpee_title, instruction.helpee_id, instruction.helpee_conversation_id, answer.observation_id, answer.answer)
        this.doAnswer(conversationId, instruction.request_id, {})
    }

    processHelpResponse(response: HelpResponse, callContext: any): Promise<void> {
        return Promise.resolve(undefined)
    }
}
