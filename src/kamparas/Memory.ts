import {Logger} from "winston";
import {rootLogger} from "@/util/RootLogger";

export type EpisodicActor = ("external" | "worker")
export type EpisodicEventType = ("task_start" | "plan" | "instruction" | "answer" | "help" | "response" | "thought" | "observation" | "hallucination" | "llm_error")

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
}

export type SemanticEventType = ("thought" | "observation"| "helpAndResponse" | "insight")

export interface SemanticMemory {
    type: SemanticEventType,
    agent_title: string,
    agent_id: string,
    conversation_id: string,
    summary: string,
    events: EpisodicEvent[]
    importance: number,
    timestamp: string,
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

    abstract recordSemanticMemory(event: Omit<SemanticMemory, "agent_title" | "agent_id">): Promise<void>

    abstract recordProceduralEvent(event: Omit<ProceduralEvent, "agent_title" | "agent_id">): Promise<void>

    abstract recordPlan(template: string): Promise<void>
    abstract recordPlanInstructions(template: string): Promise<void>

    abstract planExists(): Promise<boolean>
    abstract readPlan(input: Record<string, any>, planId?: string): Promise<string>
    abstract planInstructionsExists(): Promise<boolean>
    abstract readPlanInstructions(input: Record<string, any>, planId?: string): Promise<string>
}
