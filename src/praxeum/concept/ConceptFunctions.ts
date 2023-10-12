import {printExampleSearches, printQueryTypes} from "@/obiwan/code-gen/PrintQueryLanguageInterfaces";
import {printConceptClasses} from "@/obiwan/code-gen/PrintConceptInterfaces";
import {getOrBuildConceptClasses} from "@/obiwan/code-gen/BuildConceptClasses";
import {rootLogger} from "@/util/RootLogger";
import {getSampleRows} from "@/obiwan/query/Query";


// todo, these should not be string operations
// todo, use objects and serialization should be handled automatically
export module ConceptFunctions {
    const logger = rootLogger

    interface ListAllArgs {
        read_tables: boolean
    }
    export async function listAll(args: ListAllArgs) {
        const existing_concepts = await printConceptClasses({
            IncludeConceptDescriptions: true,
            IncludeProperties: false,
            IncludePropertyDescriptions: false,
            IncludeReferences: false
        }, undefined, args.read_tables)

        return {concepts: existing_concepts}
    }

    // todo, we should handle errors in a uniform manner. Raising some exception so that the error is reported back to llm
    interface GetDetailsArgs {
        concept_identifiers: string[], readTables: boolean
    }
    export async function getDetails(args: GetDetailsArgs) {
        const allClasses = await getOrBuildConceptClasses(args.readTables ? "table" : "concepts")
        const bdIds = args.concept_identifiers.map(id => {
            if (!allClasses[id]) {
                logger.warn("Invalid identifier", id)
                return id
            }
            return null
        }).filter(id => id != null).map(id => id!)
        if (bdIds.length) {
            logger.warn("Found bad identifiers", bdIds.length)
            return {error: `The following concept does not exist: [${bdIds.join(",")}]. Are you sure you are using the correct identifier for the concept? Please try again`}
        }
        const existing_concepts = await printConceptClasses({
            IncludeConceptDescriptions: true,
            IncludeProperties: true,
            IncludePropertyDescriptions: false,
            IncludeReferences: true
        }, args.concept_identifiers, args.readTables)

        return {concept: existing_concepts}
    }

    interface GetDetailWithSampleArgs {
        concept_identifier: string, readTables: boolean
    }
    export async function getDetailWithSample(args: GetDetailWithSampleArgs) {
        const details = await getDetails({concept_identifiers: [args.concept_identifier], readTables: args.readTables});
        if (details.error) {
            return details
        } else {
            const rows = await getSampleRows(args.readTables ? "table" : "concepts", args.concept_identifier, 5)
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