import {CodeAgent, CodeAgentOptions} from "@/kamparas/CodeAgent"
import {HelpResponse, NewTaskInstruction} from "@/kamparas/Environment"
import {getOrCreateSchemaManager} from "@/kamparas/SchemaManager"
import {z} from "zod"
import {parse} from "csv-parse";
import fs from "fs";
import {GetNumbersFor24} from "@/praxeum/learner/GetRandomSample";
import {mongoCollection} from "@/util/util";
import {DateTime} from "luxon";

export type ObservationType = "observation" | "thought" | "answer"

const numbers = []
export class SavePlan extends CodeAgent {
    static TOOL_NAME="save_plan"

    constructor(options: CodeAgentOptions) {
        super(options, {
            identifier: "alpha",
            job_description: `Saves a plan in the database`,
            input_schema: getOrCreateSchemaManager().compileZod(z.object({
                plan: z.string().describe("The plan to save")
            })),
            answer_schema: getOrCreateSchemaManager().compileZod(z.object({
                plan_id: z.string().describe("The id of the saved plan")
            }))
        })
    }

    async exec(instruction: NewTaskInstruction, conversationId: string): Promise<void> {
        const collection = await mongoCollection("learner_plan")
        const doc = await collection.insertOne({
            plan: instruction.input.plan,
            helpee_conversation_id: instruction.helpee_conversation_id,
            timestamp: new Date(DateTime.now().toISO()!)
        })

        this.doAnswer(conversationId, instruction.request_id, {
            plan_id: doc.insertedId.toHexString()
        })
    }

    processHelpResponse(response: HelpResponse, callContext: any): Promise<void> {
        return Promise.resolve(undefined)
    }
}