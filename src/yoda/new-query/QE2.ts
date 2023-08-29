import {GetDataProducts} from "@/yoda/new-query/GetDataProducts.js";
import {GetRelevantFactTables, VettedTable} from "@/yoda/new-query/GetRelevantFactTables.js";
import {GetRelevantDimensionTables} from "@/yoda/new-query/GetRelevantDimensionTables.js";
import {BaseCallContext, BindInputValue, ItemValues, RunManger} from "@/yoda/new-query/BaseItem.js";
import {GetRelevantSchemaForTable} from "@/yoda/new-query/GetRelevantSchemaForTable.js";
import {GenerateSQL} from "@/yoda/new-query/GenerateSQL.js";
import {ExecuteSQL} from "@/yoda/new-query/ExecuteSQL.js";
import {serializeTables} from "@/yoda/table-text-generator/OutputWriter.js";
import {Chain} from "@/yoda/new-query/Chain.js";
import {MapReduce} from "@/yoda/new-query/MapReduce.js";
import {Agent} from "@/yoda/new-query/Agent.js";
import {ExecuteDatabaseQueryTool} from "@/yoda/new-query/ExecuteDatabaseQueryTool.js";
import {ChatOpenAI} from "langchain/chat_models/openai";
import process from "process";
import {SQLDatabase} from "@/yoda/database/SQLDatabase.js";
import {APIListener} from "@/yoda/listener/APIListener.js";
import {mongoCollection} from "@/yoda/api/util.js";
import {GetChatTitle} from "@/yoda/new-query/GetChatTitle.js";
import {ObjectId} from "mongodb";
import {StdOutQueryListener} from "@/yoda/listener/StdOutQueryListener.js";
import {MongoEventHandler} from "@/yoda/listener/MongoEventHandler.js";

export const executeQuery = async (userId: string, chatId: string, query: string, verbose?: string) => {
  const model35 = new ChatOpenAI({
    temperature: 0,
    modelName: process.env.MODEL,
    verbose: true
  })
  console.log(process.env.MODEL_4)
  const model4 = new ChatOpenAI({
    temperature: 0,
    modelName: process.env.MODEL_4,
    verbose: true
  })

  const runManager = new RunManger()
  let runId = `${userId}-${chatId}`;
  let conversationId = new ObjectId().toString();
  let options: BaseCallContext = {model: model35, model4: model4, db: new SQLDatabase(), userId: userId, chatId: chatId, conversationId: conversationId};
  const isFirstCall = await mongoCollection("chat_history").then(collection => {
    return collection.find({userId: userId, chatId: chatId}).limit(1).toArray().then(v => v.length == 0)
  })

  if (isFirstCall) {
    const title = (await new GetChatTitle()._call(runId, {query: query}, options, runManager)).title
    console.log("got title", title)
    mongoCollection("session").then(collection => {
      collection.updateOne({userId: userId, _id: ObjectId.createFromHexString(chatId)}, {"$set": {title: title}})
    })
  }

  const apiListener = new APIListener(chatId)
  runManager.addHandler(apiListener)

  if (verbose) {
    const stdLogger = new StdOutQueryListener(JSON.parse(verbose))
    runManager.addHandler(stdLogger)
  }

  runManager.addHandler(new MongoEventHandler(userId, chatId, conversationId))
  let result = await getQueryChain()._call(runId, {query: query}, options, runManager);

  runManager.flush()
  return result
}

export const getQueryChain = () => {
  return new Agent({
    name: "main_loop",
    description: "The main loop",
    humanMessage: "{query}",
    finalAnswerKey: "result",
    outputValues: ["result", "sql", "data"],
    memoryContext: "main",
    children: [
      new ExecuteDatabaseQueryTool({
        name: "search_db_chain",
        description: `Generates and executes sql against the database returning a json object containing the data and the SQL query.
This should take a user query in plain english. DO NOT convert the input into SQL before calling.
returns: An object containing the result from the database and the SQL in the form \\{"data": "<the data>", "sql": "<the sql>"\\}
`,
        outputValues: ["data"],
        children: [
          new Chain({
            name: "gen_schema",
            description: "Generates schema from query",
            outputValues: ["data_products", "schema"],
            children: [
              new GetDataProducts(),
              new MapReduce({
                name: "mr_data_products",
                description: "Get tables for each data product and reduce them to a list of tables",
                map(input: ItemValues) {
                  return input.data_products.map((dp: string) => {
                    return new Chain({
                      name: `get_dp_tables_${dp}`,
                      description: `Get tables for data product ${dp}`,
                      outputValues: ['facts', `dimensions`],
                      children: [
                        new BindInputValue({
                          name: "bind_data_product",
                          description: "Bind the data product to the input scope",
                          data_product: dp
                        }),
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
                  console.error("**** tables", tables)
                  return {tables: tables}
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
                  return {schema: serializeTables(input.map(i => i.schema_for_table))}
                }
              }),
            ]
          }),
          new GenerateSQL(),
          new ExecuteSQL()
        ]
      })
    ]
  })
}
