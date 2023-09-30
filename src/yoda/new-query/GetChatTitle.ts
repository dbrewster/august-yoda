import {BaseLLMItem} from "@/util/llm/BaseItem";
import {HumanMessagePromptTemplate, SystemMessagePromptTemplate} from "langchain/prompts";
import {z, ZodType} from "zod";

export class GetChatTitle extends BaseLLMItem {
  readonly name: string = "getChatTitle";
  readonly description: string = "given a user query, returns an appropriate title";

  readonly humanMessages: HumanMessagePromptTemplate[] = [HumanMessagePromptTemplate.fromTemplate(`Create a very short title for the following question:\n{query}\n`)];
  readonly systemMessages: SystemMessagePromptTemplate[] = [];

  readonly llmOutputSchema: ZodType = z.object({title: z.string().describe("The title")});
}
