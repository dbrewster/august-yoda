import {BaseCallContext, BaseLLMItem, ItemValues} from "@/util/llm/BaseItem";
import {HumanMessagePromptTemplate, SystemMessagePromptTemplate} from "langchain/prompts";
import {z, ZodType} from "zod";
import {printConceptClasses} from "@/obiwan/concepts/PrintConceptInterfaces";
import {ChatOpenAI} from "langchain/chat_models/openai";

export class FindRootConcept extends BaseLLMItem {
  readonly name: string = "find_root_concept"
  readonly description: string = "Executes an LLm call to find the root concept"
  readonly humanMessages: HumanMessagePromptTemplate[] = [
    HumanMessagePromptTemplate.fromTemplate(`    
    Given the following interfaces and definitions describing them:
    ***
    {concepts}
    ***
    
    The concept MUST have a object reference path tree that answers all parts of the user question. References are forward only and traverse in a single direction.
    
    Include all interfaces that might match and the probability it correctly matches all parts of the user question. Use the interfaces and its properties to help you identify the correct answer.

    Interface names might not exactly match the types in the query. Reference chains can form a tree to access the properties needed. List the reference chains in scratchpad.
    
    What is the root of the reference chain tree for the following expression:
    {query}
    
    Let's think step by step and show your reasoning in the provided scratchpad. Verify all object references are on the correct interfaces
    `
    )
  ]
  readonly systemMessages: SystemMessagePromptTemplate[] = []

  readonly llmOutputSchema: ZodType = z.object({
    scratchpad: z.string().describe("scratchpad used to reason about the solution"),
    choices: z.array(z.object({
      concept_name: z.string().describe("the concept that matches the given user query"),
      probability: z.number().describe("A value between 0 and 1 representing the probability the choice is accurate"),
      reason: z.string().describe("the reason this concept was chosen"),
    }))
  })


  async beforeLLM(input: ItemValues, callOptions: BaseCallContext): Promise<ItemValues> {
    const allClasses = await printConceptClasses({IncludeConceptDescriptions: false, IncludePropertyDescriptions: false, IncludeProperties: true, IncludeReferences: true})
    return {...input, concepts: allClasses}
  }


  async afterLLM(input: ItemValues): Promise<ItemValues> {
    const topChoice = input.choices.sort((a: any, b: any) => b.probability - a.probability)[0]
    return {concept: topChoice.concept_name}
  }

  modelToUse(options: BaseCallContext): ChatOpenAI {
    return options.model4
  }
}
