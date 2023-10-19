import {CodeAgent, CodeAgentOptions} from "@/kamparas/CodeAgent"
import {z, ZodSchema} from "zod"
import {getOrCreateSchemaManager} from "@/kamparas/SchemaManager"
import {printConceptClasses} from "@/obiwan/concepts/PrintConceptInterfaces"
import {HelpResponse, NewTaskInstruction} from "@/kamparas/Environment"
import {getSampleRows} from "@/obiwan/concepts/Query"
import {getTypeSystem, ROOT_TYPE_SYSTEM} from "@/obiwan/concepts/TypeSystem"

abstract class GetConceptDetailsBase extends CodeAgent {

    constructor(title: string, description: string, input_schema: ZodSchema) {
        super({
            title: title,
            identifier: "alpha",
            job_description: description,
            input_schema: getOrCreateSchemaManager().compileZod(input_schema),
            answer_schema: getOrCreateSchemaManager().compileZod(z.object({
                concept: z.string().describe("A string describing details for requested concepts")
            }))
        })
    }

    async getDetails(concept_identifiers: string[]) {
        // todo -- fix this to get value from context once we add it.
        const typeSystemId = ROOT_TYPE_SYSTEM
        const typeSystem = await getTypeSystem(typeSystemId)
        const allClasses = typeSystem.getAllClasses()
        const bdIds = concept_identifiers.map(id => {
            if (!allClasses[id]) {
                this.logger.warn(`Invalid identifier "${id}"`)
                return id
            }
            return null
        }).filter(id => id != null).map(id => id!)
        if (bdIds.length) {
            this.logger.warn("Found bad identifiers", bdIds.length)
            return {error: `The following concept does not exist: [${bdIds.join(",")}]. Are you sure you are using the correct identifier for the concept? Are you building a root concept or not? Please try again`}
        }
        const existing_concepts = await printConceptClasses(typeSystem, {
            IncludeConceptDescriptions: true,
            IncludeProperties: true,
            IncludePropertyDescriptions: false,
            IncludeReferences: true
        }, concept_identifiers)

        return {concept: existing_concepts}

    }

    processHelpResponse(response: HelpResponse, callContext: any): Promise<void> {
        return Promise.resolve(undefined)
    }
}

interface GetDetailsArgs {
    concept_identifiers: string[],
}

export class GetConceptDetails extends GetConceptDetailsBase {
    constructor(options: CodeAgentOptions) {
        super(options.title, "Returns the description and properties of one or more concepts.", z.object({
            concept_identifiers: z.array(z.string().describe("The instance name of the base concept to get the detail of. Must be a valid javascript identifier"))
        }))
    }

    async exec(instruction: NewTaskInstruction, conversationId: string): Promise<void> {
        let args = instruction.input as GetDetailsArgs
        const response = await this.getDetails(args.concept_identifiers)
        // noinspection ES6MissingAwait
        this.doAnswer(conversationId, instruction.request_id, response)
    }
}

interface GetDetailWithSampleArgs {
    concept_identifier: string,
}

export class GetConceptDetailsWithSampleRows extends GetConceptDetailsBase {
    constructor(options: CodeAgentOptions) {
        super(options.title, "Returns the description and properties of an object. It also returns 5 sample rows of data.", z.object({
            concept_identifier: z.string().describe("The instance name of the base concept to get the detail of. Must be a valid javascript identifier")
        }))
    }

    async exec(instruction: NewTaskInstruction, conversationId: string): Promise<void> {
        const args = instruction.input as GetDetailWithSampleArgs
        const fn = async () => {
            const details = await this.getDetails([args.concept_identifier])
            if (details.error) {
                return details
            } else {
                // todo -- fix this to get value from context once we add it.
                const typeSystemId = ROOT_TYPE_SYSTEM
                const rows = await getSampleRows(await getTypeSystem(typeSystemId), args.concept_identifier, 5)
                let rowsAsStr = "<no data>"
                if (rows?.length) {
                    rowsAsStr = Object.keys(rows[0]).join(",") + "\n"
                    rowsAsStr += rows.map(r => Object.values(r).join(",")).join("\n")
                }
                details.concept = details.concept + "\n" + rowsAsStr
            }
            return details

        }
        const response = await fn()
        // noinspection ES6MissingAwait
        this.doAnswer(conversationId, instruction.request_id, response)
    }
}