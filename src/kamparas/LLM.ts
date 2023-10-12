import {AgentTool} from "@/kamparas/Agent";
import {EpisodicEvent} from "@/kamparas/Memory";
import {EventContent} from "@/kamparas/Environment";
import {Logger} from "winston";
import {rootLogger} from "@/util/RootLogger";

export type LLMResultType  = ("thought" | "call_helper")

export type Thought = string
export interface HelperCall {
    title: string,
    content: EventContent
}

export interface LLMResult {
    thoughts: string[]
    observations: string[]
    helperCall?: HelperCall
}

export type ModelType = ('gpt-4' | 'gpt-4-32k' | 'gpt-3.5-turbo' | 'gpt-3.5-turbo-16k')

export interface LLMExecuteOptions {
}

export abstract class LLM {
    logger: Logger = rootLogger;

    setLogger(logger: Logger) {
        this.logger = logger
    }

    abstract formatHelpers(availableHelpers: AgentTool[]): string | undefined

    abstract execute(options: LLMExecuteOptions, conversationId: string, events: EpisodicEvent[]): Promise<LLMResult>
}

export type LLMType = ("openai.textFunctions" | "openai.function")
