import {RunManger} from "@/util/llm/BaseItem";
import {APIListener} from "@/yoda/listener/APIListener";
import {mongoCollection} from "@/util/util";
import {GetChatTitle} from "@/yoda/new-query/GetChatTitle";
import {ObjectId} from "mongodb";
import {StdOutQueryListener} from "@/yoda/listener/StdOutQueryListener";
import {MongoEventHandler} from "@/yoda/listener/MongoEventHandler";
import {executeLLM} from "@/util/llm/Executor";
import {FindRootConcept} from "@/yoda/concept-query/FindRootConcept";
import dotenv from "dotenv";
import {GenerateQuery} from "@/yoda/concept-query/GenerateQuery";
import {Chain} from "@/util/llm/Chain";

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
  return new Chain({
    name: "search_chain",
    description: `Converts a question from a user, in plain text, to the output from a database.
The input to this tool is a user query in english leave the original query unchanged.
`,
    outputValues: ["data"],
    children: [
      new FindRootConcept(),
      new GenerateQuery(),
    ]
  })
}


dotenv.config()
const result = await executeQuery("123", "650e4a61db7b6547e95fe740", "Show me the number of opportunities per account and the name of the accounts for opportunities that are closed and are for products with the name 'Mega laptop'")
console.log(result)
