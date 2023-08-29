import {BaseLLMItem, ItemValues} from "@/yoda/new-query/BaseItem.js";
import {HumanMessagePromptTemplate, SystemMessagePromptTemplate} from "langchain/prompts";
import {z, ZodType} from "zod";
import {BuildSchemaText} from "@/yoda/table-text-generator/BuildSchemaText.js";
import {ObjectOutputWriter, serializeTables} from "@/yoda/table-text-generator/OutputWriter.js";
import {VettedTable} from "@/yoda/new-query/GetRelevantFactTables.js";

export class GetRelevantDimensionTables extends BaseLLMItem {
  readonly name: string = "get_dim_tables"
  readonly description: string = "Returns the relevant dimension tables that match the query"

  readonly humanMessages: HumanMessagePromptTemplate[] = [HumanMessagePromptTemplate.fromTemplate(
    `Given a list of tables and their description:
***
{table_descriptions}
***

Return a list of table names that match any part of the following query:
 %%%{query}%%%
 
Be sure to consider every column of every table and to match constants (like a number or a literal string) to likely columns in a table
ONLY return tables that are given to you. Do NOT make up table names 

Consider how relevant the table is to answer the query.`)];
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
    await schemaBuilder.buildTablesText(writer, `dp_${dataProduct}_dim_tables`)
    const dimTables = writer.buildAndClear()
    if (dimTables.length == 0) {
      this.shouldSkipLLMCall = true
      return {...input, tables: []}
    }
    return {...input, table_descriptions: serializeTables(dimTables)}
  }

  async afterLLM(input: ItemValues): Promise<ItemValues> {
    const tables = input.tables.filter((table: Record<string, string>) => table.relevance === "high").map((table: Record<string, string>) => ({
      data_product: input.data_product, isFactTable: false, table: table.table_name
    } as VettedTable))
    console.error("+++++Got dim tables", tables)
    return {dimensions:tables}
  }
}
