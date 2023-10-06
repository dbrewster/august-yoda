import {Agent} from "@/util/llm/Agent";
import {z} from "zod";
import {FindBaseConceptAgent} from "@/obiwan/auto-concept/FindBaseConceptAgent";
import {BaseCallContext, ItemValues} from "@/util/llm/BaseItem";
import {ChatOpenAI} from "langchain/chat_models/openai";
import {FindPropertiesAndConstraintAgent} from "@/obiwan/auto-concept/FindPropertiesAndConstraintAgent";


export class DefineNewConceptAgent extends Agent {
    constructor(readTables: boolean = false) {
        super(
            {
                agentMessage: `You are a helpful agent answering questions about the creation of a new concept which is represented by an interface in our system. Use the set of given tools to completely answer the users question in detail.`,
                name: "define_new_concept",
                description: "Defines the necessary components of a new concept.",
                humanMessage: `You are an agent finding information about concepts in a {system}, specifically for the {process} process.
Given the brand new concept {concept_name}

Additional Information:
{additional_instructions}

You need to find the following to define the new concept:
  1. You need to create a very detailed definition definition of the concept. The definition should contain the details for a concept, how it is used, and how it relates to the key concepts in a {system} system for the {process} process.
  2. You need to find the base concept this concept will derive from. 
  3. You need to find the constraint clause and the properties on the new concept. Be absolutely certain you use the base concept found from step 2.

Define the new concept. Create a very detailed definition definition of the concept based on your knowledge as the very first thing
`,
                children: [
                    new FindBaseConceptAgent(readTables),
                    new FindPropertiesAndConstraintAgent(readTables)
                ],
                outputValues: ["concept"],
                outputSchema: z.object({
                    concept: z.object({
                        concept_identifier: z.string().describe("A legal javascript identifier for the new concept"),
                        friendly_name: z.string().describe("A human readable name for the new concept"),
                        definition: z.string().describe("The definition of the new concept "),
                        base_concept: z.string().describe("The base concept identifier"),
                        constraint_query: z.string().describe("A query that constrains and maps this concept to the base concept."),
                        properties: z.array(z.object({
                            property_name: z.string().describe("The name of the property. The name must be a legal javascript identifier starting with a lower case character"),
                            friendly_name: z.string().describe("A human readable name of the property"),
                            description: z.string().describe("A detailed description of the property"),
                            type: z.string().describe("The type of the property."),
                        }))
                    })
                })
            });
    }

    async beforeLLM(input: ItemValues, callOptions: BaseCallContext): Promise<ItemValues> {
        return {...input, additional_instructions: input.additional_instructions || ""}
    }

    modelToUse(options: BaseCallContext): ChatOpenAI {
        return options.model4
    }
}

//
// const defineNewConcept = async (system: string, process: string, conceptName: string) => {
//     const ret = await executeLLM(new DefineNewConceptAgent(), "run", {system: system, process: process, concept_name: conceptName}, "user")
//     console.log(JSON.stringify(ret, null, 2))
//     return ret.definition
// }
//
// dotenv.config()
// await defineNewConcept("CRM", "revenue operations", "LostOpportunity")
