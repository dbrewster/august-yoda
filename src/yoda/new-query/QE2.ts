import {BaseCallContext, RunManger} from "@/yoda/new-query/BaseItem.js";
import {GenerateSQL} from "@/yoda/new-query/GenerateSQL.js";
import {ExecuteSQL} from "@/yoda/new-query/ExecuteSQL.js";
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
import {GenSchema} from "@/yoda/new-query/schema-generation/GenSchema.js";
import {PlanningChainAgent} from "@/yoda/new-query/PlanningChainAgent.js";
import {GetDataProductFacts} from "@/yoda/new-query/schema-generation/GetDataProductFacts.js";

export const executeQuery = async (userId: string, chatId: string, query: string, verbose?: string) => {
  const model35 = new ChatOpenAI({
    temperature: 0,
    modelName: process.env.MODEL,
    verbose: true
  })
  const model4 = new ChatOpenAI({
    temperature: 0,
    modelName: process.env.MODEL_4,
    verbose: true
  })

  const runManager = new RunManger()
  try {
    let runId = `${userId}-${chatId}`;
    let conversationId = new ObjectId().toString();
    let options: BaseCallContext = {
      model: model35,
      model4: model4,
      db: new SQLDatabase(),
      userId: userId,
      chatId: chatId,
      conversationId: conversationId
    };
    const isFirstCall = await mongoCollection("chat_history").then(collection => {
      return collection.find({userId: userId, chatId: chatId}).limit(1).toArray().then(v => v.length == 0)
    })

    if (isFirstCall) {
      const title = (await new GetChatTitle()._call(runId, {query: query}, options, runManager)).title
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
    return await getQueryChain()._call(runId, {query: query}, options, runManager)
  } finally {
    runManager.flush()
    runManager.close()
  }
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
        name: "search_chain",
        description: `Converts a question from a user, in plain text, to the output from a database.
The input to this tool is a user query in english. DO NOT convert the input into SQL before calling.
`,
        outputValues: ["data"],
        children: [
          new PlanningChainAgent({
            name: "gen_and_execute_sql",
            description: "Generates the schema, the SQL statement, and executes the query",
            agentMessage: `Please plan out the steps you need to take first. 
You have three tools to choose from:
  1) gen_schema: Generates the schema from the user query.
  2) gen_sql: Generates the sql from the user query and the schema
  3) exec_sql: Executes the generated schema.
 
First plan out your steps given the user query and the existing history. 
If the new query differs from the old then you might need to regenerate schema or the sql.
Feel free to use any tools available to look up relevant information.
Note that a chain of tools may be required to answer the query.
If a SQL error occurred, check the schema and sql to make sure it contained correct column names and all of the information needed. 
Only regenerate the schema if it is incomplete. 
Also note that if you have previous answers to the users question you may return those without calling a tool.`,
            humanMessage: "{query}",
            outputValues: ["data"],
            memoryContext: "gen_and_execute_sql",
            children: [
              new GenSchema(),
              new GenerateSQL(),
              new ExecuteSQL()
            ]
          })
        ]
      })
    ]
  })
}
