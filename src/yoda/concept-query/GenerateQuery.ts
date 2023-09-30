import {BaseCallContext, BaseLLMItem, ItemValues} from "@/util/llm/BaseItem";
import {HumanMessagePromptTemplate, SystemMessagePromptTemplate} from "langchain/prompts";
import {z, ZodObject, ZodType} from "zod";
import {getClosedGraph} from "@/obiwan/query/BuildConceptClasses";
import {printConceptClasses} from "@/obiwan/query/BuildConceptInterfaces";
import {executeQuery} from "@/obiwan/query/Query";

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
type BinaryOperand = ("+" | "-" | "*" | "/" | "&&" | "||" | "==" | "!=" | "<" | "<=" | ">" | ">=" | "in" | "%")
type UnaryOperand = ("!")

type BinaryOperator = [any, BinaryOperand, any]
type UnaryOperator = [UnaryOperand, any]

/*
Class that drives the search. All search operations are derived from this class. 
This class is instantiated with the driving table of the query. The driving table should ALWAYS be the specified driving table  
 */
class Query {{
  /*
    Generates the where clause for the search. The where clause filters the results by the expressions.
    
    fn: A lambda expression where the input to the expression is an object of the driving table query type. The return type is the result of an expression
  */
  where(fn: (o: InstanceType) => (BinaryOperator | UnaryOperator)): Query

  /*
    Specifies the return values for the search. The return values are used to display the results to the user.
  */
  return(fn: (o: InstanceType) => any[]): Query 

  /*
    Limits the results by the specified number of rows
  */
  limit(numRows: number)
}}
\`\`\`

Example search are:
Query(SomeObject)
.where((o) => o.a.b.c == 10 && o.a.d = 5)
.return((o) => [o.name, o.value])
.limit(5)

The driving table for this search is {driving_concept}

Generate a search that best matches the user question:
{query}
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
    const allConcepts = await getClosedGraph(concept_name)
    const interfaces = await printConceptClasses({IncludeConceptDescriptions: true, IncludePropertyDescriptions: true, IncludeProperties: true, IncludeReferences: true}, allConcepts)
    return {...input, interfaces: interfaces, driving_concept:concept_name}
  }


  async afterLLM(input: ItemValues): Promise<ItemValues> {
    const search_code = input.search_code
    const data = await executeQuery(search_code)
    return {data: data};
  }
}
