import {CodeAgent, CodeAgentOptions} from "@/kamparas/CodeAgent"
import {HelpResponse, NewTaskInstruction} from "@/kamparas/Environment"
import {getOrCreateSchemaManager} from "@/kamparas/SchemaManager"
import {z} from "zod"
import {mongoCollection} from "@/util/util"
import {nanoid} from "nanoid"

export type ObservationType = "observation" | "thought" | "answer"

export interface Observation {
    type: ObservationType
    root_observation_id: string,
    observation_id: string,
    observation_or_thought: string
}

interface CreateObservationInput {
    root_observation_id: string,
    observation: string
}
export class CreateObservation extends CodeAgent {
    static TOOL_NAME="create_observation"

    constructor(options: CodeAgentOptions) {
        super(options, {
            identifier: "alpha",
            job_description: `Records an observation for a new task. The observation is tied to a root observation by the <root_observation_id> key. The new observation id will be returned. EVERY observation that is created MUST have a corresponding answer created as well.`,
            input_schema: getOrCreateSchemaManager().compileZod(z.object({
                root_observation_id: z.string().describe("The root observation id"),
                observation: z.string().describe("A very detailed description of the observation you have made")
            })),
            answer_schema: getOrCreateSchemaManager().compileZod(z.object({
                observation_id: z.string().describe("The new id for the given observation")
            }))
        })
    }

    async exec(instruction: NewTaskInstruction, conversationId: string): Promise<void> {
        const observation = instruction.input as CreateObservationInput
        let observationId = nanoid()
        await this.memory.recordCreateObservation(instruction.helpee_title, instruction.helpee_id, instruction.helpee_conversation_id, observation.root_observation_id, observationId, observation.observation)
        this.doAnswer(conversationId, instruction.request_id, {
            observation_id: observationId
        })
    }

    processHelpResponse(response: HelpResponse, callContext: any): Promise<void> {
        return Promise.resolve(undefined)
    }
}