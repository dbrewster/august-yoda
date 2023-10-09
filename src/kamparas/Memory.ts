import {EventContent} from "@/kamparas/Environment";

export type EpisodicActor = ("external" | "worker")
export type EpisodicEventType = ("plan" | "instruction" | "help" | "response" | "thought")

export interface StructuredEpisodicEvent {
    type: string,
    content: EventContent
}
export type UnstructuredEpisodicEvent = string

export interface EpisodicEvent {
    actor: EpisodicActor,
    type: EpisodicEventType,
    content: (UnstructuredEpisodicEvent | StructuredEpisodicEvent),

    task_id: string,
    timestamp: string,
}

export type SemanticEventType = ("thought" | "observation")

export interface SemanticMemory {
    type: SemanticEventType,
    content: string

    task_id: string,
    timestamp: string,
}

export type ProceduralEventType = ("instruction" | "ask_help" | "return")

export interface ProceduralEvent {
    type: ProceduralEventType,
    previousEvent: string,

    preconditions: string,
    action_taken: string,

    task_id: string,
    timestamp: string,
}

export abstract class AgentMemory {
    abstract recordEpisodicEvent(event: EpisodicEvent): Promise<void>
    abstract readEpisodicEventsForTask(task_id: string): Promise<EpisodicEvent[]>

    abstract recordSemanticMemory(event: SemanticMemory): Promise<void>

    abstract recordProceduralEvent(event: ProceduralEvent): Promise<void>

    abstract recordPlan(template: string): Promise<void>
    abstract recordPlanInstructions(template: string): Promise<void>

    abstract readPlan(input: Record<string, any>, planId?: string): Promise<string>
    abstract readPlanInstructions(input: Record<string, any>, planId?: string): Promise<string>

}
