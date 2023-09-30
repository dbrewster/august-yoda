import {BaseCallContext, BaseLLMItem, ItemValues} from "@/util/llm/BaseItem";
import {HumanMessagePromptTemplate, SystemMessagePromptTemplate} from "langchain/prompts";
import {z, ZodType} from "zod";
import {printConceptClasses} from "@/obiwan/query/BuildConceptInterfaces";
import {ChatOpenAI} from "langchain/chat_models/openai";

export class FindRootConcept extends BaseLLMItem {
  readonly name: string = "find_root_concept"
  readonly description: string = "Executes an LLm call to find the root concept"
  readonly humanMessages: HumanMessagePromptTemplate[] = [
    HumanMessagePromptTemplate.fromTemplate(`Given the following interfaces and definitions describing them:
    ***
    {concepts}
    ***
    
    Which interface matches the following user query:
    {query}
    
    The concept MUST have an object reference path that answers all parts of the user question

    Include all interfaces that might match and the probability it correctly matches all parts of the user question. Use the interfaces and its properties to help you identify the correct answer.

    Let's think step by step and show your reasoning in the provided scratchpad. Interface names might not exactly match the types in the query. Interfaces have access to other interfaces based on the property name and type. List the reference chains in scratchpad.
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
    const allClasses = await printConceptClasses({IncludeConceptDescriptions: true, IncludePropertyDescriptions: false, IncludeProperties: false, IncludeReferences: true})
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
