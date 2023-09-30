import {HumanMessagePromptTemplate, SystemMessagePromptTemplate} from "langchain/prompts";
import {z, ZodType} from "zod";
import _ from "underscore";
import {SchemaDescriptionColumn, SchemaDescriptionTable} from "@/util/SchemaDefinitions";
import {BaseCallContext, BaseLLMItem, ItemValues} from "@/util/llm/BaseItem";
import {BuildSchemaText} from "@/yoda/table-text-generator/BuildSchemaText";
import {ObjectOutputWriter, serializeTables} from "@/yoda/table-text-generator/OutputWriter";
import {mongoCollection} from "@/util/util";
import {executeLLM} from "@/util/llm/Executor";
import dotenv from "dotenv";

class BuildDescription extends BaseLLMItem {
  readonly name: string = "BuildDescription";
  readonly description: string = "Build a description for a table";

  /*
  Given the following schema contained in triple asterisks:
***
{schema}
***


   */
  readonly humanMessages: HumanMessagePromptTemplate[] = [
    HumanMessagePromptTemplate.fromTemplate(
      `Analyze the table 
\`\`\`
{table}
\`\`\`

Think about how the table and its columns applies to the broader set of tables. Be specific and through in your answers
Write out the steps to build the description and definitions and why those are the correct steps before returning. 
Make sure you output every column given on the input
`
    ),
  ];
  readonly systemMessages: SystemMessagePromptTemplate[] = [
    SystemMessagePromptTemplate.fromTemplate("You are an expert in data analysis finding information about schemas.")];
  readonly llmOutputSchema: ZodType = z.object({
    scratchpad: z.string().describe("scratchpad used to reason about the solution"),
    name: z.string().describe("The name of the table"),
    friendly_name: z.string().describe("A human friendly name for this table"),
    description: z.string().describe("a detailed paragraph that describes the table. Be specific about the table, the columns in the table, and how it would be used"),
    definition: z.string().describe("A new detailed definition of the table. Be specific about what this property is and how it is used in the industry."),
    columns: z.array(z.object({
      name: z.string().describe("The name of the column"),
      friendly_name: z.string().describe("A human readable name for this column"),
      description: z.string().describe("a detailed sentence that describes each column. Be specific about the column and its typical use"),
      definition: z.string().describe("A new detailed definition of the column. Be specific about what this property is and how it is used in the industry."),
    }))
  });

  async beforeLLM(input: ItemValues, callOptions: BaseCallContext): Promise<ItemValues> {
    const schemaBuilder = new BuildSchemaText()
    let tableOptions = {
      includeTableFKs: false,
      includeDescription: false,
      includeTablePK: true,
      includeTableType: false
    };
    const writer = new ObjectOutputWriter(tableOptions)
    await schemaBuilder.buildTablesText(writer, "schema")
    const tables = writer.buildAndClear()
    let schema = serializeTables(tables);

    const tableWriter = new ObjectOutputWriter({
      includeTableFKs: true,
      includeDescription: false,
      includeTablePK: true,
      includeTableType: false
    }, {
      includeColumnDescriptions: false,
      includeColumnFKInfo: false,
      includeColumnPKInfo: false,
      includeOnlyFactColumns: false,
      includeColumnFriendlyName: false
    })
    await schemaBuilder.buildTableText(tableWriter, input.table_name)
    let tableSchema = serializeTables(tableWriter.buildAndClear())
    return {...input, schema: schema, table: tableSchema}
  }
}

export const buildDescriptions = async () => {
  const schemaCollection = await mongoCollection("schema")
  const schemaTables = await schemaCollection.find({}, {projection: {name: 1, _id: 0}}).map(d => d.name as string).toArray()
  const schemaDescriptionCollection = await mongoCollection("schema_descriptions")
  const existingTables = await schemaDescriptionCollection.find({}, {projection: {name: 1, _id: 0}}).map(d => d.name as string).toArray()
  console.log(existingTables)
  const tablesToProcess = _(schemaTables).without(...existingTables)

  console.log("ttp", tablesToProcess)
  const promises = tablesToProcess.map(table => {
    return () => {
      console.log("Building table ", table)
      return executeLLM(new BuildDescription(), table, {table_name: table}, "system").then(result => {
      const descriptions: SchemaDescriptionTable = {
        name: table,
        friendly_name: result.friendly_name,
        description: result.description,
        definition: result.definition,
        columns: result.columns.map((c: Record<string, any>) => {
          const ret: SchemaDescriptionColumn = {
            name: c.name,
            friendly_name: c.friendly_name,
            description: c.description,
            definition: c.definition
          }
          return ret
        })
      }
      return schemaDescriptionCollection.insertOne(descriptions).then(v => {
        console.log("Building table ", table, "done")
        return v
      })
    })
  }})

  const chunks = _(promises).chunk(10)
  for (const chunk of chunks) {
    await Promise.all(chunk.map(c => c()))
  }
}
//
dotenv.config();
await buildDescriptions()
