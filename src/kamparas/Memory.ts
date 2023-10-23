import {Logger} from "winston";
import {rootLogger} from "@/util/RootLogger";
import {SemanticWrapper} from "@/kamparas/internal/SemanticMemoryClient"
import {HelperCall} from "@/kamparas/LLM"

export type EpisodicActor = ("external" | "worker")
export type EpisodicEventType = ("task_start" | "plan" | "available_tools" | "instruction" | "answer" | "help" | "response" | "thought" | "observation" | "hallucination" | "memory" | "llm_error")

export type StructuredEpisodicEvent = Record<string, any>
export type UnstructuredEpisodicEvent = string

export interface EpisodicEvent {
    actor: EpisodicActor,
    type: EpisodicEventType,
    agent_title: string,
    agent_id: string,
    conversation_id: string,
    // NewTaskInstruction |
    content: (UnstructuredEpisodicEvent | StructuredEpisodicEvent),
    timestamp: string,
    callData?: any
}

export const eventToString = (event: EpisodicEvent) => {
    switch (event.type) {
        case "available_tools":
            return `Can use tools ${event.content}`
        case "task_start":
            return `Starting new task for agent ${event.agent_title}`
        case "answer":
            return `Returning answer from agent ${event.agent_title}`
        case "help":
            return `Asking for help from agent ${(event.content as Record<string, any>).tool_name}`
        case "response":
            return `Returning help response from agent ${event.agent_title}`
        case "llm_error":
            return `Got error from LLM ${JSON.stringify(event.content, null, 2)}`
        case "observation":
            return `LLM observation: ${event.content}`
        case "thought":
            return `LLM thought: ${event.content}`
        case "hallucination":
            return `LLM hallucinating: ${event.content}`
        case "plan":
            return event.content
        case "instruction":
            return event.content
        case "memory":
            return event.content
    }
}

export type SemanticEventType = ("event" | "reflection")

export interface SemanticMemory {
    type: SemanticEventType
    agent_title: string
    agent_id: string
    conversation_id: string
    semantic_string: string  // free form keys to search off
    memory: string
    events: string[]
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
    abstract searchSemanticMemory(query: string, size: number): Promise<SemanticWrapper[]>
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

    async recordEpisodicEvent(event: Omit<EpisodicEvent, "agent_title" | "agent_id">): Promise<void> {
        return
    }

    async recordPlan(template: string): Promise<void> {
        return
    }

    async recordPlanInstructions(template: string): Promise<void> {
        return
    }

    async recordProceduralEvent(event: Omit<ProceduralEvent, "agent_title" | "agent_id">): Promise<void> {
        return
    }

    async recordSemanticMemory(event: Omit<SemanticMemory, "agent_title" | "agent_id">): Promise<void> {
        return
    }

    async searchSemanticMemory(query: string, size: number){
        return []
    }

}