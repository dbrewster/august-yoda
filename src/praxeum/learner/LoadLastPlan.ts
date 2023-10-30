import {CodeAgent, CodeAgentOptions} from "@/kamparas/CodeAgent"
import {HelpResponse, NewTaskInstruction} from "@/kamparas/Environment"
import {getOrCreateSchemaManager} from "@/kamparas/SchemaManager"
import {z} from "zod"
import {parse} from "csv-parse";
import fs from "fs";
import {GetNumbersFor24} from "@/praxeum/learner/GetRandomSample";
import {mongoCollection} from "@/util/util";

export type ObservationType = "observation" | "thought" | "answer"

const numbers = []
export class LoadLastPlan extends CodeAgent {
    static TOOL_NAME="load_last_plan"

    constructor(options: CodeAgentOptions) {
        super(options, {
            identifier: "alpha",
            job_description: `Loads the last plan from the DB`,
            input_schema: getOrCreateSchemaManager().compileZod(z.object({})),
            answer_schema: getOrCreateSchemaManager().compileZod(z.object({
                plan: z.string().describe("The last plan"),
                conversation_id: z.string().describe("The conversation_id the last plan used"),
            }))
        })
    }

    async exec(instruction: NewTaskInstruction, conversationId: string): Promise<void> {
        const collection = await mongoCollection("learner_plan")
        const docs = await collection.find<Record<string, string>>({}).sort({timestamp: -1}).limit(1).toArray()

        const doc = docs![0]
        this.doAnswer(conversationId, instruction.request_id, {
            plan: doc.plan,
            conversation_id: doc.helpee_conversation_id
        })
    }

    processHelpResponse(response: HelpResponse, callContext: any): Promise<void> {
        return Promise.resolve(undefined)
    }
}