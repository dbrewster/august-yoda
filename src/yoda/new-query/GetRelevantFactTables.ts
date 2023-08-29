import {BaseLLMItem, ItemValues} from "@/yoda/new-query/BaseItem.js";
import {HumanMessagePromptTemplate, SystemMessagePromptTemplate} from "langchain/prompts";
import {z, ZodType} from "zod";
import {BuildSchemaText} from "@/yoda/table-text-generator/BuildSchemaText.js";
import {ObjectOutputWriter, serializeTables} from "@/yoda/table-text-generator/OutputWriter.js";

export interface VettedTable {
  data_product: string
  isFactTable: boolean
  table: string
}

export class GetRelevantFactTables extends BaseLLMItem {
  readonly name: string = "get_fact_tables"
  readonly description: string = "Returns the relevant fact tables that match the query"

  readonly humanMessages: HumanMessagePromptTemplate[] = [HumanMessagePromptTemplate.fromTemplate(
    `Given a list of tables and their description:
***
{table_descriptions}
***

Return a list of table names that match any part of the following query:
 %%%{query}%%%
 
Be sure to consider every column of every table and to match constants (like a number or a literal string) to likely columns in a table
ONLY return tables that are given to you. Do NOT make up table names 

Consider how relevant the table is to answer the query.
`)];
  readonly systemMessages: SystemMessagePromptTemplate[] = [];
  readonly llmOutputSchema: ZodType = z.object({tables: z.array(z.object({
      table_name: z.string().describe("the table related to the user query"),
      relevance: z.enum(["high", "medium", "low", "none"]).describe("The relevance of this table to the user query")
    }))})

  async beforeLLM(input: ItemValues): Promise<ItemValues> {
    const dataProduct: string = input.data_product
    const schemaBuilder = new BuildSchemaText()
    let tableOptions = {
      includeTableFKs: false,
      includeDescription: true,
      includeTablePK: false,
      includeTableType: false
    };
    const writer = new ObjectOutputWriter(tableOptions)
    await schemaBuilder.buildTablesText(writer, `dp_${dataProduct}_fact_tables`)
    const factTables = writer.buildAndClear()

    if (factTables.length == 0) {
      this.shouldSkipLLMCall = true
      return {...input, tables:[]}
    }
    return {...input, table_descriptions: serializeTables(factTables)}
  }

  async afterLLM(input: ItemValues): Promise<ItemValues> {
    const tables = input.tables.filter((table: Record<string, string>) => table.relevance === "high").map((table: Record<string, string>) => ({
      data_product: input.data_product, isFactTable: true, table: table.table_name
    } as VettedTable))
    return {facts:tables}
  }
}
