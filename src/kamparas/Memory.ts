import {Logger} from "winston";
import {rootLogger} from "@/util/RootLogger";
import OpenAI from "openai"
import Embedding = OpenAI.Embedding

export type EpisodicActor = ("external" | "worker")
export type EpisodicEventType = ("task_start" | "plan" | "available_tools" | "instruction" | "answer" | "help" | "response" | "thought" | "observation" | "hallucination" | "llm_error")

export type StructuredEpisodicEvent = Record<string, any>
export type UnstructuredEpisodicEvent = string

export interface EpisodicEvent {
    actor: EpisodicActor,
    type: EpisodicEventType,
    agent_title: string,
    agent_id: string,
    conversation_id: string,
    content: (UnstructuredEpisodicEvent | StructuredEpisodicEvent),
    timestamp: string,
    callData?: any
}

export type SemanticEventType = ("event" | "reflection")


export interface Reflection {
    summary: string
    events: EpisodicEvent[]
}

export interface SemanticMemory {
    type: SemanticEventType
    agent_title: string
    agent_id: string
    conversation_id: string
    semantic_string: string  // free form keys to search off
    memory: EpisodicEvent | Reflection
    importance: number
    timestamp: string
}

export type ProceduralEventType = ("instruction" | "ask_help" | "return")

export interface ProceduralEvent {
    type: ProceduralEventType,
    agent_title: string,
    agent_id: string,
    conversation_id: string,
    previousEvent: string,
    preconditions: string,
    action_taken: string,
    timestamp: string,
}

export abstract class AgentMemory {
    logger: Logger = rootLogger;

    setLogger(logger: Logger) {
        this.logger = logger
    }

    abstract recordEpisodicEvent(event: Omit<EpisodicEvent, "agent_title" | "agent_id">): Promise<void>
    abstract readEpisodicEventsForTask(conversation_id: string, limit?: number): Promise<EpisodicEvent[]>
    abstract findEpisodicEvent(query: Record<string, any>): Promise<EpisodicEvent | null>

    abstract recordSemanticMemory(event: Omit<SemanticMemory, "agent_title" | "agent_id">): Promise<void>

    abstract recordProceduralEvent(event: Omit<ProceduralEvent, "agent_title" | "agent_id">): Promise<void>

    abstract recordPlan(template: string): Promise<void>
    abstract recordPlanInstructions(template: string): Promise<void>

    abstract planExists(): Promise<boolean>
    abstract readPlan(input: Record<string, any>, planId?: string): Promise<string>
    abstract planInstructionsExists(): Promise<boolean>
    abstract readPlanInstructions(input: Record<string, any>, planId?: string): Promise<string>
}

export class NoOpMemory extends AgentMemory {
    findEpisodicEvent(query: Record<string, any>): Promise<EpisodicEvent | null> {
        return Promise.resolve(null);
    }

    planExists(): Promise<boolean> {
        return Promise.resolve(false);
    }

    planInstructionsExists(): Promise<boolean> {
        return Promise.resolve(false);
    }

    readEpisodicEventsForTask(conversation_id: string, limit?: number): Promise<EpisodicEvent[]> {
        return Promise.resolve([]);
    }

    readPlan(input: Record<string, any>, planId?: string): Promise<string> {
        return Promise.resolve("");
    }

    readPlanInstructions(input: Record<string, any>, planId?: string): Promise<string> {
        return Promise.resolve("");
    }

    recordEpisodicEvent(event: Omit<EpisodicEvent, "agent_title" | "agent_id">): Promise<void> {
        return Promise.resolve(undefined);
    }

    recordPlan(template: string): Promise<void> {
        return Promise.resolve(undefined);
    }

    recordPlanInstructions(template: string): Promise<void> {
        return Promise.resolve(undefined);
    }

    recordProceduralEvent(event: Omit<ProceduralEvent, "agent_title" | "agent_id">): Promise<void> {
        return Promise.resolve(undefined);
    }

    recordSemanticMemory(event: Omit<SemanticMemory, "agent_title" | "agent_id">): Promise<void> {
        return Promise.resolve(undefined);
    }

}