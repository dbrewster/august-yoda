import {BaseCallContext, BaseLLMItem, ItemValues} from "@/util/llm/BaseItem";
import {HumanMessagePromptTemplate, SystemMessagePromptTemplate} from "langchain/prompts";
import {z, ZodType} from "zod";
import {BuildSchemaText} from "@/yoda/table-text-generator/BuildSchemaText";
import {ObjectOutputWriter, serializeTables} from "@/yoda/table-text-generator/OutputWriter";
import {KnowledgeConcept, KnowledgeConceptProperty, MetaConcepts} from "@/obiwan/meta-concepts/MetaConcepts";
import {ChatOpenAI} from "langchain/chat_models/openai";
import dotenv from "dotenv";
import {executeLLM} from "@/util/llm/Executor";




dotenv.config()

const tables = await processConcept("opportunity")
console.log(tables)