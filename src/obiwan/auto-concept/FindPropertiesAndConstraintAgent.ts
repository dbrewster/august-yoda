import {BaseCallContext, BaseItem, BaseOptions, ItemValues, RunManger} from "@/util/llm/BaseItem";
import {Agent, ToolItem} from "@/util/llm/Agent";
import {undefined, z, ZodSchema, ZodType} from "zod";
import {printConceptClasses} from "@/obiwan/concepts/PrintConceptInterfaces";
import {ChatOpenAI} from "langchain/chat_models/openai";
import {getSampleRows} from "@/obiwan/concepts/Query";
import {printExampleSearches, printQueryTypes} from "@/obiwan/concepts/PrintQueryLanguageInterfaces";
import {getOrBuildConceptClasses} from "@/obiwan/concepts/BuildConceptClasses";

export class GetConceptDetailsWithSampleRows extends BaseItem implements ToolItem {
    readonly name: string = "get_concept_details_with_rows"
    readonly description: string = "Returns the description and properties of an object. It also returns 5 sample rows of data."
    inputSchema: ZodType = z.object({
        concept_identifier: z.string().describe("The instance name of the concept to get the detail of. Must be a valid javascript identifier")
    })
    private _readTables: boolean;

    constructor(readTables: boolean, props?: BaseOptions) {
        super(props);
        this._readTables = readTables;
    }

    async call(runId: string, input: ItemValues, options: BaseCallContext, runManager: RunManger | undefined): Promise<ItemValues> {
        const allClasses = await getOrBuildConceptClasses(this._readTables ? "table" : "concepts")
        if (!allClasses[input.concept_identifier]) {
            return {error: `concept ${input.concept_identifier} does not exist. Are you sure you are using the correct identifier for the concept?`}
        }
        const existing_concepts = await printConceptClasses({
            IncludeConceptDescriptions: true,
            IncludeProperties: true,
            IncludePropertyDescriptions: false,
            IncludeReferences: true
        }, [input.concept_identifier], this._readTables)

        const rows = await getSampleRows(this._readTables ? "table" : "concepts", input.concept_identifier, 5)
        let rowsAsStr = "<no data>"
        if (rows?.length) {
            rowsAsStr = Object.keys(rows[0]).join(",") + "\n"
            rowsAsStr += rows.map(r => Object.values(r).join(",")).join("\n")
        }
        return {concept: existing_concepts}
    }
}

export class GetQueryInterface extends BaseItem implements ToolItem {
    readonly name: string = "get_query_interfaces"
    readonly description: string = "Returns the query interfaces needed to define a new query"
    inputSchema: ZodSchema = z.object({})
    private _readTables: boolean;

    constructor(readTables: boolean, props?: BaseOptions) {
        super(props);
        this._readTables = readTables;
    }

    async call(runId: string, input: ItemValues, options: BaseCallContext, runManager: RunManger | undefined): Promise<ItemValues> {
        return {query_language: printQueryTypes(), examples: printExampleSearches()}
    }
}

export class FindPropertiesAndConstraintAgent extends Agent implements ToolItem {
    inputSchema: ZodSchema = z.object({
        system: z.string().describe("The type system we are defining concepts for"),
        process: z.string().describe("The specific process in the system we are defining for"),
        concept_name: z.string().describe("The name of the concept"),
        concept_description: z.string().describe("A detailed description of the concept we are finding the base concept for"),
        base_concept: z.string().describe("The identifier of the base concept to derive the properties from")
    })

    constructor(readTables: boolean = false) {
        super(
            {
                agentMessage: "You are a helpful agent answering questions about generating information about creating or modifying interfaces in a concept graph. Use the set of given tools to completely answer the users question in detail.",
                name: "find_concept_properties_and_constraints",
                description: "Finds the optimal set of properties for the the concept given information about the new concept and a base concept and finds a query that maps the new concept to the base concept",
                humanMessage: `You are an agent finding information about concepts in a {system}, specifically for the {process} process.
Given the brand new concept {concept_name} and it's description:
{concept_description}

And a base concept of {base_concept}

You are finding the optimal set of properties that should exist on this new concept. You will do this by:
  1. Use the provided tool to load the definition of the query interfaces
  2. Get a detailed description of the base concept, {base_concept}
  3. Analyze the properties to determine which properties you can drop off of the new concept. You can drop properties that will only appear in a where clause to create this concept, or properties that are no longer relevant to the new concept. You can also combine properties into higher order properties, if that is necessary.
  4. Generate a Query that maps the base object to this object. You will be filling in the the "where" and "return" parts of the query. The query will start with "Query({base_concept}).
  5. Filter the properties to the necessary list. Explain why you filtered a property
  6. Finally return the new properties and the mapping query
  
Define the properties and constraint query for the new concept

Think about how each interface is used in a {system} process and write your intermediate results
`,
                children: [
                    new GetConceptDetailsWithSampleRows(readTables),
                    new GetQueryInterface(readTables),
                ],
                outputValues: ["constraint_query", "properties"],
                outputSchema: z.object({
                    constraint_query: z.string().describe("The constraint query that maps this concept to the base concept"),
                    properties: z.array(z.object({
                        property_name: z.string().describe("The name of the property. The name must be a legal javascript identifier starting with a lower case character"),
                        friendly_name: z.string().describe("A human readable name of the property"),
                        description: z.string().describe("A detailed description of the property"),
                        type: z.string().describe("The type of the property."),
                        reason: z.string().describe("The reason why this property is on the property and why it should be kept"),
                        should_drop: z.boolean().describe("Should this property be dropped or kept on the concept"),
                    }))
                })
            });
    }


    async beforeLLM(input: ItemValues, callOptions: BaseCallContext): Promise<ItemValues> {
        return super.beforeLLM(input, callOptions);
    }

    modelToUse(options: BaseCallContext): ChatOpenAI {
        return options.model4
    }
}
//
// dotenv.config()
//
// const ret = await executeLLM(new FindPropertiesAndConstraintAgent(), "run", {
//     "system": "CRM",
//     "process": "revenue operations",
//     "concept_name": "LostOpportunity",
//     "concept_description": "A LostOpportunity in a CRM system for the revenue operations process refers to a potential sale that did not convert into an actual sale for various reasons. It is a key concept as it helps in understanding the reasons for not achieving the sales target and in formulating strategies to improve sales performance.",
//     "base_concept": "Opportunity"
// }, "user")
// console.log(ret)
//
