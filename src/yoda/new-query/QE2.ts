import {RunManger} from "@/util/llm/BaseItem";
import {GenerateSQL} from "@/yoda/new-query/GenerateSQL";
import {ExecuteSQL} from "@/yoda/new-query/ExecuteSQL";
import {Agent} from "@/util/llm/Agent";
import {ExecuteDatabaseQueryTool} from "@/yoda/new-query/ExecuteDatabaseQueryTool";
import {APIListener} from "@/yoda/listener/APIListener";
import {mongoCollection} from "@/util/util";
import {GetChatTitle} from "@/yoda/new-query/GetChatTitle";
import {ObjectId} from "mongodb";
import {StdOutQueryListener} from "@/yoda/listener/StdOutQueryListener";
import {MongoEventHandler} from "@/yoda/listener/MongoEventHandler";
import {GenSchema} from "@/yoda/new-query/schema-generation/GenSchema";
import {PlanningChainAgent} from "@/yoda/new-query/PlanningChainAgent";
import {executeLLM} from "@/util/llm/Executor";

export const executeQuery = async (userId: string, chatId: string, query: string, verbose?: string) => {
  const runManager = new RunManger()
  try {
    let runId = `${userId}-${chatId}`;
    let conversationId = new ObjectId().toString();
    const isFirstCall = await mongoCollection("chat_history").then(collection => {
      return collection.find({userId: userId, chatId: chatId}).limit(1).toArray().then(v => v.length == 0)
    })

    if (isFirstCall) {
      const title = (await executeLLM(new GetChatTitle(), runId, {query: query}, userId, {chatId: chatId, conversationId: conversationId})).title
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
    return await executeLLM(getQueryChain(), runId, {query: query}, userId, {chatId: chatId, conversationId: conversationId}, runManager)
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
