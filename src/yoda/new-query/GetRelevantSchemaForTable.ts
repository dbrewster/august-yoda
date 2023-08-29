import {BaseLLMItem, ItemValues} from "@/yoda/new-query/BaseItem.js";
import {HumanMessagePromptTemplate, SystemMessagePromptTemplate} from "langchain/prompts";
import {z, ZodType} from "zod";
import {BuildSchemaText} from "@/yoda/table-text-generator/BuildSchemaText.js";
import {ObjectOutputWriter, serializeTables} from "@/yoda/table-text-generator/OutputWriter.js";

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
 
 If not columns match just return an empty list
`)];
  readonly systemMessages: SystemMessagePromptTemplate[] = [];
  readonly llmOutputSchema: ZodType = z.object({columns: z.array(z.string()).describe("the column names that match this query")})

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
    const columns = new Set(input.columns as string[])
    const schemaWriter = new ObjectOutputWriter({
      includeTableFKs: true,
      includeDescription: true,
      includeTablePK: true,
      includeTableType: true,
    }, {
      columnsToInclude: (_, column) => {
        return columns.has(column.name) || column.is_pk || column.is_fk
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
  }
}
