import {PlatformBuilder} from "@/kamparas/PlatformBuilder"
import {AgentEnvironment} from "@/kamparas/Environment"
import {LLM, LLMType, ModelType} from "@/kamparas/LLM"
import {AgentMemory} from "@/kamparas/Memory"
import {RabbitAgentEnvironment} from "@/kamparas/internal/RabbitAgentEnvironment"
import {OpenAIFunctionsLLM, OpenAITextFunctionsLLM} from "@/kamparas/internal/OpenAILLM"
import {MongoMemory} from "@/kamparas/internal/MongoMemory"
import {AgentIdentifier} from "@/kamparas/Agent"

export class MongoRabbitPlatform extends PlatformBuilder {
    buildEnvironment(): AgentEnvironment {
        return new RabbitAgentEnvironment()
    }

    buildLLM(type: LLMType, model: ModelType, temperature: number): LLM {
        switch (type) {
            case "openai.textFunctions":
                return new OpenAITextFunctionsLLM(model, temperature)
            case "openai.function":
                return new OpenAIFunctionsLLM(model, temperature)
            default:
                throw `Invalid LLM type ${type}`
        }
    }

    buildMemory(agent: AgentIdentifier): AgentMemory {
        return new MongoMemory(agent)
    }
}
