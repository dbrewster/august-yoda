import {BaseLLMItem, ItemValues} from "@/util/llm/BaseItem";
import {HumanMessagePromptTemplate, SystemMessagePromptTemplate} from "langchain/prompts";
import {z, ZodType} from "zod";
import {mongoCollection} from "@/util/util";
import {Document} from "mongodb";

export class GetDataProducts extends BaseLLMItem {
  readonly name: string = "get_data_products"
  readonly description: string = "Returns the data products relevant to the query"

  readonly humanMessages: HumanMessagePromptTemplate[] = [HumanMessagePromptTemplate.fromTemplate(
    `Given a list of the data product names and their description:
***
{data_products_description}
***

Only list the data products that are directly included in the following query:
 %%%{query}%%%
`)];
  readonly systemMessages: SystemMessagePromptTemplate[] = [];
  readonly llmOutputSchema: ZodType = z.object({
    data_products: z.array(z.object({
      data_product: z.string().describe("The data product"),
      relevance: z.enum(["high", "medium", "low", "none"]).describe("The relevance of this data product to the query")
    }).describe("the data products related to the user query"))
    })

  async beforeLLM(input: ItemValues): Promise<ItemValues> {
    const dpDefinitions = (await mongoCollection("system_dps").then(async collection => {
      return collection.find({}, {projection: {"name": 1, "description": 1, _id: 0}})
        .map((obj: Document) => `Data Product Name:${obj['name']}, Description:${obj["description"]}`).toArray();
    })).join("\n")

    return {data_products_description: dpDefinitions, ...input};
  }

  async afterLLM(input: ItemValues): Promise<ItemValues> {
    return {data_products: input.data_products.filter((o: Record<"data_product" | "relevance", string>) => o.relevance === "high").map((o: Record<"data_product" | "relevance", string>) => o.data_product)}
  }
}
