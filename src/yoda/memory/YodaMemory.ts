import {AIMessage, BaseMessage, FunctionMessage, HumanMessage, SystemMessage} from "langchain/schema";
import {mongoCollection} from "@/yoda/api/util.js";

export const addMemoryMessage = async (userId: string, chatId: string, conversationId: string, context: string, message: BaseMessage) => {
  return mongoCollection("chat_history").then(collection => {
    collection.insertOne({
      userId: userId,
      chatId: chatId,
      conversationId: conversationId,
      context: context,
      message: message.toDict()
    })
  })
}

export const getMemory = (userId: string, chatId: string, context: string) => {
  return mongoCollection("chat_history").then(collection => {
    return collection.find({
      userId: userId,
      chatId: chatId,
      context: context,
    }).map(doc => {
      const message = doc.message as Record<string, any>
      switch (message.type) {
        case "human":
          return new HumanMessage(message.data)
        case "ai":
          let kwargs = message.data.additional_kwargs;
          if (!kwargs?.function_call) {
            kwargs = {}
          }
          let aiMessage = new AIMessage(message.data.content || "", kwargs);
          return aiMessage
        case "system":
          return new SystemMessage(message.data)
        case "function":
          return new FunctionMessage(message.data)
        default:
          console.error("invalid message type", doc.type)
      }
    }).toArray()
  }).then(v => v  as BaseMessage[])
}