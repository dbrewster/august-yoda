import {AgentMemory} from "@/kamparas/Memory"
import {AgentEnvironment} from "@/kamparas/Environment"
import {LLM, LLMType, ModelType} from "@/kamparas/LLM"
import {AgentIdentifier} from "@/kamparas/Agent"

export abstract class PlatformBuilder {
    abstract buildMemory(agent: AgentIdentifier): AgentMemory
    abstract buildEnvironment(): AgentEnvironment
    abstract buildLLM(type: LLMType, model: ModelType, temperature: number): LLM
}
