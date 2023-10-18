import {printExampleSearches, printQueryTypes} from "@/obiwan/concepts/PrintQueryLanguageInterfaces";
import {CodeAgent, CodeAgentOptions} from "@/kamparas/CodeAgent";
import {z} from "zod";
import {getOrCreateSchemaManager} from "@/kamparas/SchemaManager";
import {HelpResponse, NewTaskInstruction} from "@/kamparas/Environment";


export class GetQueryInterfaces extends CodeAgent {
    constructor(options: CodeAgentOptions) {
        super({
            ...options,
            identifier: "alpha",
            job_description: "Returns the query interfaces needed to define a new query",
            input_schema: getOrCreateSchemaManager().compileZod(z.object({})),
            answer_schema: getOrCreateSchemaManager().compileZod(z.object({
                query_language: z.string().describe("The concept query language rules"),
                examples: z.string().describe("Examples of how to use concept the query language"),
            }))
        });
    }

    async exec(instruction: NewTaskInstruction, conversationId: string): Promise<void> {
        // noinspection ES6MissingAwait
        this.doAnswer(conversationId, instruction.request_id, {
            query_language: printQueryTypes(),
            examples: printExampleSearches()
        })
    }

    processHelpResponse(response: HelpResponse, callContext: any): Promise<void> {
        return Promise.resolve(undefined)
    }
}

