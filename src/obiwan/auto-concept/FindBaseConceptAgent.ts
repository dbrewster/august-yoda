import {BaseCallContext, BaseItem, BaseOptions, ItemValues, RunManger} from "@/util/llm/BaseItem";
import {Agent, ToolItem} from "@/util/llm/Agent";
import {z, ZodSchema, ZodType} from "zod";
import {printConceptClasses} from "@/obiwan/code-gen/PrintConceptInterfaces";
import {ChatOpenAI} from "langchain/chat_models/openai";
import {getOrBuildConceptClasses} from "@/obiwan/code-gen/BuildConceptClasses";

export class GetAllConcepts extends BaseItem implements ToolItem {
    readonly name: string = "get_all_concepts"
    readonly description: string = "Returns all concepts used in the system. This returns the interface and a description of the interface."
    inputSchema: ZodType = z.object({})
    private _readTables: boolean;

    constructor(readTables: boolean, props?: BaseOptions) {
        super(props);
        this._readTables = readTables;
    }

    async call(runId: string, input: ItemValues, options: BaseCallContext, runManager: RunManger | undefined): Promise<ItemValues> {
        const existing_concepts = await printConceptClasses({
            IncludeConceptDescriptions: true,
            IncludeProperties: false,
            IncludePropertyDescriptions: false,
            IncludeReferences: false
        }, undefined, this._readTables)

        return {concepts: existing_concepts}
    }
}

export class GetConceptDetails extends BaseItem implements ToolItem {
    readonly name: string = "get_concept_details"
    readonly description: string = "Returns the description and properties of one or more concepts."
    inputSchema: ZodType = z.object({
        concept_identifiers: z.array(z.string().describe("The instance name of the base concept to get the detail of. Must be a valid javascript identifier"))
    })
    private _readTables: boolean;

    constructor(readTables: boolean, props?: BaseOptions) {
        super(props);
        this._readTables = readTables;
    }

    async call(runId: string, input: ItemValues, options: BaseCallContext, runManager: RunManger | undefined): Promise<ItemValues> {
        const allClasses = await getOrBuildConceptClasses(this._readTables ? "table" : "concepts")
        const baseConceptIdentifiers: string[] = input.concept_identifiers;
        const bdIds = baseConceptIdentifiers.map(id => {
            if (!allClasses[id]) {
                console.log("invalid identifier", id)
                return id
            }
            return null
        }).filter(id => id != null).map(id => id!)
        if (bdIds.length) {
            console.log("bad identifiers", bdIds)
            return {error: `The following concept does not exist: [${bdIds.join(",")}]. Are you sure you are using the correct identifier for the concept? Please try again`}
        }
        const existing_concepts = await printConceptClasses({
            IncludeConceptDescriptions: true,
            IncludeProperties: true,
            IncludePropertyDescriptions: false,
            IncludeReferences: true
        }, baseConceptIdentifiers, this._readTables)

        return {concept: existing_concepts}
    }
}

export class FindBaseConceptAgent extends Agent implements ToolItem {
    inputSchema: ZodSchema = z.object({
        system: z.string().describe("The type system we are defining concepts for"),
        process: z.string().describe("The specific process in the system we are defining for"),
        concept_name: z.string().describe("The name of the concept"),
        concept_definition: z.string().describe("A very detailed definition of the concept we are finding the base concept for"),
    })

    constructor(readTables: boolean = false) {
        super(
            {
                agentMessage: "You are a helpful agent answering questions about generating information about creating or modifying interfaces in a concept graph. Use the set of given tools to completely answer the users question in detail.",
                name: "find_base_concept",
                description: "Finds the base concept for a new concept.",
                humanMessage: `You are an agent finding information about concepts in a {system}, specifically for the {process} process.
Given the brand new concept {concept_name} and it's definition:
{concept_definition}

You are finding the correct base concept to derive this concept from. You can think of the base concept as a delegate concept for this new type. The base concept must be at the same grain, or level, as the new concept.

Find the list of base concepts that might be a match. Return the concept name, a reason why it was chosen, and a probability, between 0 and 1, that it is a good candidate.

Once you have the list, order the list by best probability (closest to 1), limit the check to 3-5 items, and then check the result by getting the details of the top few candidates. Use the details to make your final decision.

Think about how each interface is used in a {system} process and write your intermediate results
`,
                children: [
                    new GetAllConcepts(readTables),
                    new GetConceptDetails(readTables)
                ],
                outputValues: ["base_concept"],
                outputSchema: z.object({
                    base_concept: z.string().describe("The identifier of the base concept ")
                })
            });

    }

    modelToUse(options: BaseCallContext): ChatOpenAI {
        return options.model4
    }
}
