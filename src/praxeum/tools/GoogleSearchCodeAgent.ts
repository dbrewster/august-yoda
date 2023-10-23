import {CodeAgent, CodeAgentOptions} from "@/kamparas/CodeAgent"
import {HelpResponse, NewTaskInstruction} from "@/kamparas/Environment"
import {z} from "zod"
import {getOrCreateSchemaManager} from "@/kamparas/SchemaManager"
import {google} from "googleapis"

/*
<script async src="https://cse.google.com/cse.js?cx=a5c65630a4a114da0">
</script>
<div class="gcse-search"></div>
 */
export class GoogleSearchCodeAgent extends CodeAgent {
    customSearch = google.customsearch("v1")

    constructor(options: CodeAgentOptions) {
        super({
            ...options,
            job_description: "Searches google and returns the results",
            is_root: false,
            identifier: "alpha",
            input_schema: getOrCreateSchemaManager().compileZod(z.object({question: z.string()})),
            answer_schema: getOrCreateSchemaManager().compileZod(z.object({
                answer: z.array(z.object({
                    title: z.string().describe("the title of the search result"),
                    link: z.string().describe("The link to the search result"),
                    snippet: z.string().describe("A small snippet of the web page"),
                }))
            })),
        })
    }

    async exec(instruction: NewTaskInstruction, conversationId: string): Promise<void> {
        const res = await this.customSearch.cse.list({
            cx: process.env.GOOGLE_CX,
            q: instruction.input.question,
            auth: process.env.GOOGLE_APIKEY,
        });
        const searchResults = res.data.items?.map(item => ({
            title: item.title,
            link: item.link,
            snippet: item.snippet
        })) || []
        return this.doAnswer(conversationId, instruction.request_id, {
            answer: searchResults
        })
    }

    processHelpResponse(response: HelpResponse, callContext: any): Promise<void> {
        return Promise.resolve(undefined)
    }

}