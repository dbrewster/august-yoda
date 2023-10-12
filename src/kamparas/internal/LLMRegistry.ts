import {OpenAIFunctionsLLM, OpenAITextFunctionsLLM} from "@/kamparas/internal/OpenAILLM";
import {LLM, LLMType, ModelType} from "@/kamparas/LLM";

const llmFunctions: Record<LLMType, new(model: ModelType, number: number) => LLM> = {
    "openai.textFunctions": OpenAITextFunctionsLLM,
    "openai.function": OpenAIFunctionsLLM,
}

export function makeLLM(llmName: LLMType, model: ModelType, number: number) {
    return new llmFunctions[llmName](model, number)
}
