import {BaseLLMItem, ItemValues} from "@/util/llm/BaseItem";
import {HumanMessagePromptTemplate, SystemMessagePromptTemplate} from "langchain/prompts";
import {z, ZodType} from "zod";
import {BuildSchemaText} from "@/yoda/table-text-generator/BuildSchemaText";
import {ObjectOutputWriter, serializeTables} from "@/yoda/table-text-generator/OutputWriter";

export class GetRelevantSchemaForTable extends BaseLLMItem {
  readonly name: string = "get_schema_for_table"
  readonly description: string = "Returns the columns that best match the user query for the given table"

  readonly humanMessages: HumanMessagePromptTemplate[] = [HumanMessagePromptTemplate.fromTemplate(
    `Given a table and its columns
***
{table_schema}
***

Return a list of columns from this table that best match the following query:
 %%%{query}%%%
 
  Consider how relevant the column is to answer the query.
`)];
  readonly systemMessages: SystemMessagePromptTemplate[] = [];
  readonly llmOutputSchema: ZodType = z.object({
    columns: z.array(z.object({
        column_name: z.string().describe("the column names that match this query"),
        relevance: z.enum(["high", "medium", "low", "none"]).describe("The relevance of this table to the user query")
      }
    ))
  })

  async beforeLLM(input: ItemValues): Promise<ItemValues> {
    const table: string = input.table
    const dataProduct: string = input.data_product
    const isFactTable: boolean = input.is_fact_table
    const schemaBuilder = new BuildSchemaText()
    const writer = new ObjectOutputWriter({
      includeTableFKs: false,
      includeDescription: true,
      includeTablePK: false,
      includeTableType: true
    }, {
      includeColumnDescriptions: true,
      includeColumnFKInfo: false,
      includeColumnPKInfo: false,
      includeOnlyFactColumns: true,
      includeColumnFriendlyName: false
    })
    let collectionName = isFactTable ? `dp_${dataProduct}_fact_tables` : `dp_${dataProduct}_dim_tables`;
    await schemaBuilder.buildTableText(writer, table, collectionName)
    const schema = writer.buildAndClear()

    return {table_schema: serializeTables(schema), ...input};
  }

  async afterLLM(input: ItemValues): Promise<ItemValues> {
    const table: string = input.table
    const dataProduct: string = input.data_product
    const isFactTable: boolean = input.is_fact_table
    const columns = new Set(input.columns.filter((o: Record<"column_name" | "relevance", string>) => o.relevance === "high" || o.relevance === "medium").map((o: Record<"column_name" | "relevance", string>) => o.column_name))
    if (columns.size > 0) {
      console.log("In cols not zero")
      const schemaWriter = new ObjectOutputWriter({
        includeTableFKs: true,
        includeDescription: true,
        includeTablePK: true,
        includeTableType: true,
      }, {
        columnsToInclude: (_, column) => {
          return columns.has(column.name) || column.is_pk// || column.is_fk
        },
        includeColumnDescriptions: true,
        includeColumnFKInfo: false,
        includeColumnPKInfo: false,
        includeOnlyFactColumns: false,
        includeColumnFriendlyName: true
      })
      const schemaBuilder = new BuildSchemaText()
      let collectionName = isFactTable ? `dp_${dataProduct}_fact_tables` : `dp_${dataProduct}_dim_tables`;
      await schemaBuilder.buildTableText(schemaWriter, table, collectionName)
      const outputSchema = schemaWriter.buildAndClear()
      return {data_product: dataProduct, table: table, is_fact_table: isFactTable, schema_for_table: outputSchema[0]}
    } else {
      console.log("In cols zero")
      return {data_product: dataProduct, table: table, is_fact_table: isFactTable}
    }
  }
}
