import {CodeAgent, CodeAgentOptions} from "@/kamparas/CodeAgent"
import {getOrCreateSchemaManager} from "@/kamparas/SchemaManager"
import {z} from "zod"
import {HelpResponse, NewTaskInstruction} from "@/kamparas/Environment"
import {printConceptClasses} from "@/obiwan/concepts/PrintConceptInterfaces"
import {getTypeSystem, ROOT_TYPE_SYSTEM} from "@/obiwan/concepts/TypeSystem"

interface ListAllArgs {
}

export const legalConceptTypes = ["RootConcept", "DerivedConcept"]

export class ListAllConcepts extends CodeAgent {

    constructor(options: CodeAgentOptions) {
        super({
            ...options,
            identifier: "alpha",
            job_description: "Returns all concepts used in the system. This returns the interface and a description of the interface.",
            input_schema: getOrCreateSchemaManager().compileZod(z.object({
            })),
            answer_schema: getOrCreateSchemaManager().compileZod(z.object({
                concepts: z.string().describe("A comma separated list of concept names"),
            }))
        });
    }

    async exec(instruction: NewTaskInstruction, conversationId: string): Promise<void> {
        let response: Record<string, any>
        const args = instruction.input as ListAllArgs
        // todo -- fix this to get value from context once we add it.
        const typeSystemId = ROOT_TYPE_SYSTEM
        const existing_concepts = await printConceptClasses(await getTypeSystem(typeSystemId), {
            IncludeConceptDescriptions: true,
            IncludeProperties: false,
            IncludePropertyDescriptions: false,
            IncludeReferences: false
        }, undefined)

        response = {concepts: existing_concepts}

        // noinspection ES6MissingAwait
        this.doAnswer(conversationId, instruction.request_id, response)
    }

    processHelpResponse(response: HelpResponse, callContext: any): Promise<void> {
        return Promise.resolve(undefined);
    }
}