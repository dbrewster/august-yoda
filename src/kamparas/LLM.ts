import {AgentIdentifier} from "@/kamparas/Agent";
import {EpisodicEvent} from "@/kamparas/Memory";
import {EventContent} from "@/kamparas/Environment";

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
    abstract formatHelpers(availableHelpers: AgentIdentifier[]): string

    abstract execute(options: LLMExecuteOptions, events: EpisodicEvent[]): Promise<LLMResult>
}
