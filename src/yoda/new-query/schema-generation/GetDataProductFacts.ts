import {BaseCallContext, BaseItem, BaseLLMItem, ItemValues, RunManger} from "@/yoda/new-query/BaseItem.js";
import {undefined, z, ZodType} from "zod";
import {HumanMessagePromptTemplate, SystemMessagePromptTemplate} from "langchain/prompts";
import {mongoCollection} from "@/yoda/api/util.js";

export class GetDataProductFacts extends BaseLLMItem {
  readonly name: string = "get_data_product_facts"
  readonly description: string = "Gets the data product facts needed to create schema and SQL. Data Product facts are used to describe features about tables and columns related to a data product"

  readonly humanMessages: HumanMessagePromptTemplate[] = [HumanMessagePromptTemplate.fromTemplate(
    `Given a list of the resources that describe the function of tables and columns in our system:
***
{dp_facts_in}
***

List the facts that are relevant to the following query
 %%%{query}%%%
 
 When processing the facts take, use the query to reason about why a fact should apply to the user query and how will it help generate a SQL query.
 
 List the facts that apply, the reason they apply, and the relevance of each fact.
`)];
  readonly systemMessages: SystemMessagePromptTemplate[] = [];
  readonly llmOutputSchema: ZodType = z.object({
    facts: z.array(z.object({
      fact: z.string().describe("The fact"),
      relevance: z.enum(["high", "medium", "low", "none"]).describe("The relevance of this fact to the query"),
      reason: z.string().describe("The reason this fact applies to the query"),
    }).describe("the facts related to the user query"))
    })

  async beforeLLM(input: ItemValues): Promise<ItemValues> {
    const data_product = input.data_product
    const collection = await mongoCollection(`dp_${data_product}_facts`)
    const allFacts = (await collection.find({}, {projection: {_id:0}}).toArray())
      .map(v => v as Record<string, any>)
      .map(v => v.fact as string)

    return {dp_facts_in: allFacts, ...input};
  }

  async afterLLM(input: ItemValues): Promise<ItemValues> {
    return {dp_facts: input.facts.filter((o: Record<"facts" | "relevance", string>) => o.relevance === "high").map((o: Record<"fact" | "relevance" | "reason", string>) => o.fact)}
  }
}

export class GetDataProductFacts2 extends BaseItem {
  readonly name: string = "get_data_product_facts"
  readonly description: string = "Gets the data product facts needed to create schema and SQL. Data Product facts are used to describe features about tables and columns related to a data product"

  async call(runId: string, input: ItemValues, options: BaseCallContext, runManager: RunManger | undefined): Promise<ItemValues> {
    const data_product = input.data_product
    const collection = await mongoCollection(`dp_${data_product}_facts`)
    const allFacts = (await collection.find({}, {projection: {_id:0}}).toArray())
      .map(v => v as Record<string, any>)
      .map(v => v.fact as string)

    return {dp_facts: allFacts.join("\n")};
  }
}
