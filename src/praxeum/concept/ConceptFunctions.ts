import {printExampleSearches, printQueryTypes} from "@/obiwan/code-gen/PrintQueryLanguageInterfaces";
import {printConceptClasses} from "@/obiwan/code-gen/PrintConceptInterfaces";
import {getOrBuildConceptClasses} from "@/obiwan/code-gen/BuildConceptClasses";
import {rootLogger} from "@/util/RootLogger";
import {getSampleRows} from "@/obiwan/query/Query";

export const defineNewConceptTitle = "define_new_concept"

// todo, these should not be string operations
// todo, use objects and serialization should be handled automatically
export module ConceptFunctions {
    const logger = rootLogger

    interface ListAllArgs {
        concept_type: string
    }
    export async function listAll(args: ListAllArgs) {
        if (!legalConceptTypes.find(c => c === args.concept_type)) {
            logger.warn("LLM requested bad concept type", args.concept_type)
            return {error: `The concept_type of ${args.concept_type} is invalid. Legal values are [${legalConceptTypes.join(",")}]. Please try again`}
        }
        const existing_concepts = await printConceptClasses({
            IncludeConceptDescriptions: true,
            IncludeProperties: false,
            IncludePropertyDescriptions: false,
            IncludeReferences: false
        }, undefined, args.concept_type === "RootConcept")

        return {concepts: existing_concepts}
    }

    const legalConceptTypes = ["RootConcept", "DerivedConcept"]

    // todo, we should handle errors in a uniform manner. Raising some exception so that the error is reported back to llm
    interface GetDetailsArgs {
        concept_identifiers: string[],
        concept_type: string
    }
    export async function getDetails(args: GetDetailsArgs) {
        if (!legalConceptTypes.find(c => c === args.concept_type)) {
            logger.warn("LLM requested bad concept type", args.concept_type)
            return {error: `The concept_type of ${args.concept_type} is invalid. Legal values are [${legalConceptTypes.join(",")}]. Please try again`}
        }
        const allClasses = await getOrBuildConceptClasses((args.concept_type === "RootConcept") ? "table" : "concepts")
        const bdIds = args.concept_identifiers.map(id => {
            if (!allClasses[id]) {
                logger.warn("Invalid identifier", id)
                return id
            }
            return null
        }).filter(id => id != null).map(id => id!)
        if (bdIds.length) {
            logger.warn("Found bad identifiers", bdIds.length)
            return {error: `The following concept does not exist: [${bdIds.join(",")}]. Are you sure you are using the correct identifier for the concept? Are you building a root concept or not? Please try again`}
        }
        const existing_concepts = await printConceptClasses({
            IncludeConceptDescriptions: true,
            IncludeProperties: true,
            IncludePropertyDescriptions: false,
            IncludeReferences: true
        }, args.concept_identifiers, args.concept_type === "RootConcept")

        return {concept: existing_concepts}
    }

    interface GetDetailWithSampleArgs {
        concept_identifier: string,
        concept_type: string
    }
    export async function getDetailWithSample(args: GetDetailWithSampleArgs) {
        if (!legalConceptTypes.find(c => c === args.concept_type)) {
            logger.warn("LLM requested bad concept type", args.concept_type)
            return {error: `The concept_type of ${args.concept_type} is invalid. Legal values are [${legalConceptTypes.join(",")}]. Please try again`}
        }
        const details = await getDetails({concept_identifiers: [args.concept_identifier], concept_type: args.concept_type});
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



    export function getInterfaces(args: any) {
        return {query_language: printQueryTypes(), examples: printExampleSearches()}
    }
}