import {OpenAIFunctionsLLM, OpenAITextFunctionsLLM} from "@/kamparas/internal/OpenAILLM";
import {LLM, LLMType} from "@/kamparas/LLM";

const llmFunctions: Record<LLMType, new() => LLM> = {
    "openai.textFunctions": OpenAITextFunctionsLLM,
    "openai.function": OpenAIFunctionsLLM,
}

export function makeLLM(llmName: LLMType) {
    return new llmFunctions[llmName]()
}
