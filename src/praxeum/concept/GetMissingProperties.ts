import {CodeAgent, CodeAgentOptions} from "@/kamparas/CodeAgent"
import {getOrCreateSchemaManager} from "@/kamparas/SchemaManager"
import {string, z} from "zod"
import {HelpResponse, NewTaskInstruction} from "@/kamparas/Environment"
import {printConceptClasses} from "@/obiwan/concepts/PrintConceptInterfaces"
import {getTypeSystem, ROOT_TYPE_SYSTEM} from "@/obiwan/concepts/TypeSystem"

interface CopyMissingPropertiesArgs {
    concept_name: string
    base_object_name: string
}

export class GetMissingProperties extends CodeAgent {

    constructor(options: CodeAgentOptions) {
        super({
            ...options,
            identifier: "alpha",
            job_description: "Returns all concepts used in the system. This returns the interface and a description of the interface.",
            input_schema: getOrCreateSchemaManager().compileZod(z.object({
                concept_name: z.string().describe("The name of the concept we are creating or editing"),
                base_object_name: z.string().describe("The name of the base object"),
            })),
            answer_schema: getOrCreateSchemaManager().compileZod(z.object({
                deletedProperties: z.array(z.string().describe("the property name")).describe("The names of the properties that were deleted from the new concept"),
                addedProperties: z.array(z.string().describe("the property name")).describe("The names of the properties that were added from the new concept"),
                newPropertiesForConcept: z.array(z.string().describe("the property name")).describe("The property names for the new concept"),
            }))
        });
    }

    async exec(instruction: NewTaskInstruction, conversationId: string): Promise<void> {
        const args = instruction.input as CopyMissingPropertiesArgs
        // todo -- fix this to get value from context once we add it.
        const typeSystemId = ROOT_TYPE_SYSTEM
        let typeSystem = await getTypeSystem(typeSystemId)
        const existingConceptProperties = new Set(typeSystem.getConcept(args.concept_name).properties.map(p => p.name))
        const baseConceptProperties = typeSystem.getConcept(args.base_object_name).properties.map(p => p.name)
        const result = {
            deletedProperties:[] as string[],
            addedProperties:[] as string[],
            newPropertiesForConcept: [] as string[]
        }
        baseConceptProperties.forEach(prop => {
            result.newPropertiesForConcept.push(prop)

            if (!existingConceptProperties.delete(prop)) {
                result.addedProperties.push(prop)
            }
        })
        result.deletedProperties = Array.from(baseConceptProperties)

        // noinspection ES6MissingAwait
        this.doAnswer(conversationId, instruction.request_id, result)
    }

    processHelpResponse(response: HelpResponse, callContext: any): Promise<void> {
        return Promise.resolve(undefined);
    }
}