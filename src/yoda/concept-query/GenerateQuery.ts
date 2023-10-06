import {BaseCallContext, BaseLLMItem, ItemValues} from "@/util/llm/BaseItem";
import {HumanMessagePromptTemplate, SystemMessagePromptTemplate} from "langchain/prompts";
import {z, ZodType} from "zod";
import {getClosedGraph} from "@/obiwan/code-gen/BuildConceptClasses";
import {printConceptClasses} from "@/obiwan/code-gen/PrintConceptInterfaces";
import {executeQuery} from "@/obiwan/query/Query";
import {printExampleSearches, printQueryTypes} from "@/obiwan/code-gen/PrintQueryLanguageInterfaces";

export class GenerateQuery extends BaseLLMItem {
  readonly name: string = "generate_search_text"
  readonly description: string = "generates a code to search the database given a user question and a root concept"

  readonly humanMessages: HumanMessagePromptTemplate[] = [
    HumanMessagePromptTemplate.fromTemplate(
`Given the following interfaces:
***
{interfaces}
***

and the following search syntax delineated by triple backticks:
\`\`\`
{querySyntax}
\`\`\`

Example searches are:
{exampleSearch}

The driving table for this search is {driving_concept}

Generate a search that best matches the user question:
{query}

Let's think step by step and show your reasoning in the provided scratchpad.
`
    )
  ]
  readonly systemMessages: SystemMessagePromptTemplate[] = []

  readonly llmOutputSchema: ZodType = z.object({
    scratchpad: z.string().describe("scratchpad used to reason about the solution"),
    search_code: z.string().describe("The code used to generate search"),
  })


  async beforeLLM(input: ItemValues, callOptions: BaseCallContext): Promise<ItemValues> {
    const concept_name = input.concept
    const allConcepts = await getClosedGraph("concepts", concept_name)
    const interfaces = await printConceptClasses({IncludeConceptDescriptions: false, IncludePropertyDescriptions: false, IncludeProperties: true, IncludeReferences: true}, allConcepts)
    return {...input, interfaces: interfaces, driving_concept:concept_name, querySyntax: printQueryTypes(), exampleSearch: printExampleSearches()}
  }

  async afterLLM(input: ItemValues): Promise<ItemValues> {
    const search_code = input.search_code
    const data = await executeQuery(search_code)
    return {data: data};
  }
}
