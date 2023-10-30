import {CodeAgent, CodeAgentOptions} from "@/kamparas/CodeAgent"
import {HelpResponse, NewTaskInstruction} from "@/kamparas/Environment"
import {getOrCreateSchemaManager} from "@/kamparas/SchemaManager"
import {z} from "zod"
import {parse} from "csv-parse";
import fs from "fs";

export type ObservationType = "observation" | "thought" | "answer"

const numbers: string[] = await parse(fs.readFileSync("src/praxeum/learner/24.csv"), {
        delimiter: ",",
        cast: true,
        columns: true
    }).map(data => {
        return data["Puzzles"]
    }).toArray()

export class GetNumbersFor24 extends CodeAgent {
    static TOOL_NAME="get_numbers"
    static numbers = numbers

    constructor(options: CodeAgentOptions) {
        super(options, {
            identifier: "alpha",
            job_description: `Returns a new sequence of numbers for the game 24`,
            input_schema: getOrCreateSchemaManager().compileZod(z.object({})),
            answer_schema: getOrCreateSchemaManager().compileZod(z.object({
                numbers: z.string().describe("The numbers for the game")
            }))
        })
    }

    async exec(instruction: NewTaskInstruction, conversationId: string): Promise<void> {
        const index = Math.floor(Math.random() * GetNumbersFor24.numbers.length)
        this.doAnswer(conversationId, instruction.request_id, {
            numbers: GetNumbersFor24.numbers[index]
        })
    }

    processHelpResponse(response: HelpResponse, callContext: any): Promise<void> {
        return Promise.resolve(undefined)
    }
}
