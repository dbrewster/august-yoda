import {AgentIdentifier, AgentTool} from "@/kamparas/Agent";
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
    helperCall?: HelperCall
}

export type ModelType = ('gpt-4' | 'gpt-4-32k' | 'gpt-3.5-turbo' | 'gpt-3.5-turbo-16k')

export interface LLMExecuteOptions {
    model: ModelType,
    temperature?: number
}

export abstract class LLM {
    logger: Logger = rootLogger;

    setLogger(logger: Logger) {
        this.logger = logger
    }

    abstract formatHelpers(availableHelpers: AgentTool[]): string

    abstract execute(options: LLMExecuteOptions, taskId: string, events: EpisodicEvent[]): Promise<LLMResult>
}
