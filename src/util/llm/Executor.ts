import {ChatOpenAI} from "langchain/chat_models/openai";
import {BaseCallContext, BaseItem, ItemValues, RunManger} from "@/util/llm/BaseItem";
import {SQLDatabase} from "@/util/SQLDatabase";
import {InputValues} from "langchain/schema";

export const executeLLM = (item: BaseItem, runId: string, input: InputValues, userId: string, options: Record<string, any> = {}, runManager: RunManger | undefined = undefined, temperature: number = 0): Promise<ItemValues> => {
  const model35 = new ChatOpenAI({
    modelName: process.env.MODEL,
    // verbose: true,
    temperature: temperature
  })
  const model4 = new ChatOpenAI({
    temperature: temperature,
    modelName: process.env.MODEL_4,
    // verbose: true,
  })
  let iOptions: BaseCallContext = {
    model: model35,
    model4: model4,
    db: new SQLDatabase(),
    userId: userId,
  };

  if (options) {
    iOptions = {...iOptions, ...options}
  }
  return item._call(runId, input, iOptions, runManager || new RunManger())
}
