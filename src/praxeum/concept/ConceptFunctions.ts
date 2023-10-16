import {printExampleSearches, printQueryTypes} from "@/obiwan/code-gen/PrintQueryLanguageInterfaces";
import {printConceptClasses} from "@/obiwan/code-gen/PrintConceptInterfaces";
import {getOrBuildConceptClasses} from "@/obiwan/code-gen/BuildConceptClasses";
import {getSampleRows} from "@/obiwan/query/Query";
import {CodeAgent, CodeAgentOptions} from "@/kamparas/CodeAgent";
import {z, ZodSchema} from "zod";
import {getOrCreateSchemaManager} from "@/kamparas/SchemaManager";
import {HelpResponse, NewTaskInstruction} from "@/kamparas/Environment";

export const defineNewConceptTitle = "define_new_concept"


interface ListAllArgs {
    concept_type: string
}

const legalConceptTypes = ["RootConcept", "DerivedConcept"]

export class ListAllConcepts extends CodeAgent {

    constructor(options: CodeAgentOptions) {
        super({
            ...options,
            identifier: "alpha",
            job_description: "Returns all concepts used in the system. This returns the interface and a description of the interface.",
            input_schema: getOrCreateSchemaManager().compileZod(z.object({
                concept_type: z.string().describe("The type of the new concept we are building.  Must be one of RootConcept or DerivedConcept based on the concept type that is being created or edited")
            })),
            answer_schema: getOrCreateSchemaManager().compileZod(z.object({
                concepts: z.string().describe("A comma separated list of concept names"),
            }))
        });
    }

    async exec(instruction: NewTaskInstruction, conversationId: string): Promise<void> {
        let response: Record<string, any>
        const args = instruction.input as ListAllArgs
        if (!legalConceptTypes.find(c => c === args.concept_type)) {
            this.logger.warn("LLM requested bad concept type", args.concept_type)
            response = {error: `The concept_type of ${args.concept_type} is invalid. Legal values are [${legalConceptTypes.join(",")}]. Please try again`}
        } else {
            const existing_concepts = await printConceptClasses({
                IncludeConceptDescriptions: true,
                IncludeProperties: false,
                IncludePropertyDescriptions: false,
                IncludeReferences: false
            }, undefined, args.concept_type === "RootConcept")

            response = {concepts: existing_concepts}
        }

        // noinspection ES6MissingAwait
        this.doAnswer(conversationId, instruction.request_id, response)
    }

    processHelpResponse(response: HelpResponse, callContext: any): Promise<void> {
        return Promise.resolve(undefined);
    }
}

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

    async getDetails(concept_type: string, concept_identifiers: string[]) {
        if (!legalConceptTypes.find(c => c === concept_type)) {
            this.logger.warn("LLM requested bad concept type", concept_type)
            return {error: `The concept_type of ${concept_type} is invalid. Legal values are [${legalConceptTypes.join(",")}]. Please try again`}
        }
        const allClasses = await getOrBuildConceptClasses((concept_type === "RootConcept") ? "table" : "concepts")
        const bdIds = concept_identifiers.map(id => {
            if (!allClasses[id]) {
                this.logger.warn(`Invalid identifier "${id}`)
                return id
            }
            return null
        }).filter(id => id != null).map(id => id!)
        if (bdIds.length) {
            this.logger.warn("Found bad identifiers", bdIds.length)
            return {error: `The following concept does not exist: [${bdIds.join(",")}]. Are you sure you are using the correct identifier for the concept? Are you building a root concept or not? Please try again`}
        }
        const existing_concepts = await printConceptClasses({
            IncludeConceptDescriptions: true,
            IncludeProperties: true,
            IncludePropertyDescriptions: false,
            IncludeReferences: true
        }, concept_identifiers, concept_type === "RootConcept")

        return {concept: existing_concepts}

    }

    processHelpResponse(response: HelpResponse, callContext: any): Promise<void> {
        return Promise.resolve(undefined)
    }
}

interface GetDetailsArgs {
    concept_identifiers: string[],
    concept_type: string
}

export class GetConceptDetails extends GetConceptDetailsBase {
    constructor(options: CodeAgentOptions) {
        super(options.title, "Returns the description and properties of one or more concepts.", z.object({
            concept_type: z.string().describe("The type of the new concept we are building.  Must be one of RootConcept or DerivedConcept based on the concept type that is being created or edited"),
            concept_identifiers: z.array(z.string().describe("The instance name of the base concept to get the detail of. Must be a valid javascript identifier"))
        }))
    }

    async exec(instruction: NewTaskInstruction, conversationId: string): Promise<void> {
        let args = instruction.input as GetDetailsArgs
        const response = await this.getDetails(args.concept_type, args.concept_identifiers)
        // noinspection ES6MissingAwait
        this.doAnswer(conversationId, instruction.request_id, response)
    }
}

interface GetDetailWithSampleArgs {
    concept_identifier: string,
    concept_type: string
}

export class GetConceptDetailsWithSampleRows extends GetConceptDetailsBase {
    constructor(options: CodeAgentOptions) {
        super(options.title, "Returns the description and properties of an object. It also returns 5 sample rows of data.", z.object({
            concept_type: z.string().describe("The type of the new concept we are building.  Must be one of RootConcept or DerivedConcept based on the concept type that is being created or edited"),
            concept_identifier: z.string().describe("The instance name of the base concept to get the detail of. Must be a valid javascript identifier")
        }))
    }

    async exec(instruction: NewTaskInstruction, conversationId: string): Promise<void> {
        const args = instruction.input as GetDetailWithSampleArgs
        const fn = async () => {
            if (!legalConceptTypes.find(c => c === args.concept_type)) {
                this.logger.warn("LLM requested bad concept type", args.concept_type)
                return {error: `The concept_type of ${args.concept_type} is invalid. Legal values are [${legalConceptTypes.join(",")}]. Please try again`}
            }
            const details = await this.getDetails(args.concept_type, [args.concept_identifier])
            if (details.error) {
                return details
            } else {
                const rows = await getSampleRows((args.concept_type === "RootConcept") ? "table" : "concepts", args.concept_identifier, 5)
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

