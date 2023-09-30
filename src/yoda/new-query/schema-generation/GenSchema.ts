import {Chain} from "@/util/llm/Chain";
import {GetDataProducts} from "@/yoda/new-query/GetDataProducts";
import {MapReduce} from "@/util/llm/MapReduce";
import {BindInputValue, ItemValues} from "@/util/llm/BaseItem";
import {GetRelevantFactTables, VettedTable} from "@/yoda/new-query/schema-generation/GetRelevantFactTables";
import {GetRelevantDimensionTables} from "@/yoda/new-query/schema-generation/GetRelevantDimensionTables";
import {GetRelevantSchemaForTable} from "@/yoda/new-query/schema-generation/GetRelevantSchemaForTable";
import {serializeTables} from "@/yoda/table-text-generator/OutputWriter";
import {ToolItem} from "@/util/llm/Agent";
import {z, ZodType} from "zod";
import {GetSystemFacts, GetSystemFacts2} from "@/yoda/new-query/schema-generation/GetSystemFacts";
import {GetDataProductFacts, GetDataProductFacts2} from "@/yoda/new-query/schema-generation/GetDataProductFacts";

export class GenSchema extends Chain implements ToolItem {
  inputSchema: ZodType = z.object({
    query: z.string().describe("the question the user is asking")
  })

  constructor() {
    super({
      name: "gen_schema",
      description: "Use this tool to generate the schema from the user query.",
      outputValues: ["data_products", "schema", "system_facts", "dp_facts"],
      children: [
        new GetSystemFacts2(),
        new GetDataProducts(),
        new MapReduce({
          name: "mr_data_products",
          description: "Get tables for each data product and reduce them to a list of tables",
          map(input: ItemValues) {
            return input.data_products.map((dp: string) => {
              return new Chain({
                name: `get_dp_tables_${dp}`,
                description: `Get tables for data product ${dp}`,
                outputValues: ['dp_facts', `dimensions`, "facts"],
                children: [
                  new BindInputValue({
                    name: "bind_data_product",
                    description: "Bind the data product to the input scope",
                    data_product: dp
                  }),
                  new GetDataProductFacts2(),
                  new GetRelevantFactTables(),
                  new GetRelevantDimensionTables()
                ]
              })
            })
          },
          async reduce(values: ItemValues[]) {
            // we should have an array of values that contain either a fact key or a dimension key
            let tables = values.map(value => {
              let tables = value.facts as VettedTable[]
              if (value.dimensions) {
                tables = tables.concat(value.dimensions)
              }
              return tables
            }).flat();
            let dp_facts = values.map(value => value.dp_facts).join("\n:")
            return {tables: tables, dp_facts: dp_facts}
          }
        }),
        new MapReduce({
          name: "mr_process_tables",
          description: "map (dp, isFactTable, table)[] -> schema for each",
          map: (iv) => {
            return iv.tables.map((table: VettedTable) => {
              return new Chain({
                name: `get_schema_for_${table.data_product}_${table.table}`,
                description: `Get schema for ${table.data_product}_${table.table}`,
                outputValues: ['schema_for_table'],
                children: [
                  new BindInputValue({
                    name: "bind_table",
                    description: "Bind the table to the input scope",
                    data_product: table.data_product,
                    is_fact_table: table.isFactTable,
                    table: table.table
                  }),
                  new GetRelevantSchemaForTable()
                ]
              })
            })
          },
          reduce(input: ItemValues[]) {
            return {schema: serializeTables(input.map(i => i.schema_for_table).filter(s => s))}
          }
        }),
      ]
    })
  }
}
