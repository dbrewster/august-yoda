import {ZodObject, ZodSchema} from "zod";
import {ChatOpenAI} from "langchain/chat_models/openai";
import {HumanMessagePromptTemplate, SystemMessagePromptTemplate} from "langchain/prompts";
// @ts-ignore
import {zodToJsonSchema} from "zod-to-json-schema";
import {LLMResult} from "langchain/schema";
import {SQLDatabase} from "@/yoda/database/SQLDatabase.js";
import {EventHandler} from "@/yoda/listener/EventHandler.js";
import {DateTime} from "luxon";

export type ItemValues = Record<string, any>

export interface BaseCallContext {
  userId: string
  chatId: string
  conversationId: string
  db: SQLDatabase
  model: ChatOpenAI,
  model4: ChatOpenAI
}

export interface BaseOptions {
}

export class RunManger {
  private eventHandlers: EventHandler[] = []

  handleEvent(id: string, eventName: string, args: Record<string, any>) {
    const now = DateTime.now()
    this.eventHandlers.forEach(handler => handler.handleEvent({id, timeStamp: now, eventName, args}))
  }

  public addHandler(handler: EventHandler) {
   this.eventHandlers = this.eventHandlers.concat(handler)
  }

  flush() {
    this.eventHandlers.forEach((handler: any) => {
      if (handler.flush) {
        handler.flush()
      }
    })
  }
}

export abstract class BaseItem<T extends BaseOptions = BaseOptions> {
  abstract readonly name: string
  abstract readonly description: string

  props: T;

  constructor(props?: T) {
    this.props = props || {} as T;
  }

  async _call(runId: string, input: ItemValues, options: BaseCallContext, runManager?: RunManger): Promise<ItemValues> {
    runId = runId + ":" + this.name
    runManager?.handleEvent(runId, "onCallStart", {input:input})
    const ret = await this.call(runId, input, options, runManager)
    runManager?.handleEvent(runId, "onCallEnd", {result: ret})
    return ret
  }
  abstract call(runId: string, input: ItemValues, options: BaseCallContext, runManager?: RunManger): Promise<ItemValues>
}

export abstract class BaseLLMItem<T extends BaseOptions = BaseOptions> extends BaseItem<T> {
  abstract readonly systemMessages: SystemMessagePromptTemplate[]
  abstract readonly humanMessages: HumanMessagePromptTemplate[]

  abstract readonly llmOutputSchema: ZodSchema<ZodObject<any>>

  shouldSkipLLMCall: boolean = false


  async beforeLLM(input: ItemValues, callOptions: BaseCallContext): Promise<ItemValues> {
    return input
  }

  async afterLLM(input: ItemValues): Promise<ItemValues> {
    return input
  }

  modelToUse(options: BaseCallContext): ChatOpenAI {
    return options.model
  }

  async call(runId: string, input: ItemValues, options: BaseCallContext, runManager?: RunManger): Promise<ItemValues> {
    const afterFnCallInput = await this.beforeLLM(input, options)
    let llmResultValue = {}
    if (!this.shouldSkipLLMCall) {
      let messages = this.systemMessages.map(m => m.format(afterFnCallInput))
      messages = messages.concat(this.humanMessages.map(m => m.format(afterFnCallInput)))

      const jsonSchema = {
        name: this.name,
        description: this.description,
        parameters: zodToJsonSchema(this.llmOutputSchema)
      }
      jsonSchema.name = this.name
      // todo -- implement retry???
      let messagesForLLM = await Promise.all(messages);
      runManager?.handleEvent(runId, "onBeforeExecLLM", {messages: messagesForLLM})
      const llmResult: LLMResult = await this.modelToUse(options).generate([messagesForLLM], {
        functions: [jsonSchema]
      }).catch((reason) => {
        const errorReason = reason.response ? reason.response.data : reason.message
        console.error(errorReason)
        runManager?.handleEvent(runId, "onErrorExecLLM", {error: errorReason})
        return Promise.reject(errorReason)
      })
      const generation = llmResult.generations[0][0] as Record<string, any>
      const returnArgs = generation.message.additional_kwargs.function_call.arguments as string
      llmResultValue = this.llmOutputSchema.parse(JSON.parse(returnArgs)) as Record<string, any>
      runManager?.handleEvent(runId, "onAfterExecLLM", {llmResult: llmResult, result: llmResultValue})
    }
    return this.afterLLM({...afterFnCallInput, ...llmResultValue})
  }
}

export interface BaseNameDescriptionOptions extends BaseOptions {
  name: string
  description: string
}

export abstract class BaseNameDescriptionItem<T extends BaseNameDescriptionOptions = BaseNameDescriptionOptions> extends BaseItem<T> {
  public readonly name: string
  public readonly description: string

  constructor(props: T) {
    super(props);
    this.name = this.props.name
    this.description = this.props.description
  }
}

interface BindInputValueOptions extends BaseNameDescriptionOptions {
  [key: string]: any
}

export class BindInputValue extends BaseNameDescriptionItem<BindInputValueOptions> {
  async call(runId: string, input: ItemValues): Promise<ItemValues> {
    const newValues: ItemValues = {...input, ...this.props}
    delete newValues.name
    delete newValues.description

    return newValues;
  }
}

