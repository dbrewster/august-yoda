import {ToolItem} from "@/util/llm/Agent";
import {undefined, z, ZodSchema, ZodType} from "zod";
import {BaseCallContext, BaseItem, BaseLLMItem, ItemValues, RunManger} from "@/util/llm/BaseItem";
import {HumanMessagePromptTemplate, SystemMessagePromptTemplate} from "langchain/prompts";
import {ChatOpenAI} from "langchain/chat_models/openai";
import {printConceptClasses} from "@/obiwan/code-gen/PrintConceptInterfaces";
import {getRootConcept} from "@/obiwan/code-gen/BuildConceptClasses";
import {Chain} from "@/util/llm/Chain";

export class FindConceptDetails extends BaseLLMItem implements ToolItem {
    readonly name: string = "find_concept_details"
    readonly description: string = "Returns the details for a concept, how it is used, and how it relates to the key concepts for a specified system for a particular process"

    readonly humanMessages: HumanMessagePromptTemplate[] = [
        HumanMessagePromptTemplate.fromTemplate(`Think about how the following topic is used in a {system} process. Include details about the object, how it is used, and how it relates to the key concepts in the {function} process.

What is a {concept_name}?`)
    ]
    readonly systemMessages: SystemMessagePromptTemplate[] = [
        SystemMessagePromptTemplate.fromTemplate(`You are an expert in customer relationship management and are defining business terms. Specifically you are looking for definitions related to the {function} function.`)
    ]

    readonly llmOutputSchema?: ZodSchema

    inputSchema: ZodType = z.object({
        system: z.string().describe("The type of system the concept is defined in."),
        function: z.string().describe("The function or process in the specified system."),
        concept_name: z.string().describe("The name of the concept to create a definition for."),
    })

    modelToUse(options: BaseCallContext): ChatOpenAI {
        return options.model
    }
}

export class GetConceptsRelatedToNewConcept extends BaseLLMItem {
    readonly name: string = "get_related_concepts"
    readonly description: string = "Returns the existing concepts related to a new concept"

    readonly humanMessages: HumanMessagePromptTemplate[] = [
        HumanMessagePromptTemplate.fromTemplate(`Given a list of existing concepts:
{existing_concepts}

Given a new concept definition:
/*
{concept_definition}
*/
interface {concept_identifier} extends InstanceType {{}}

What existing concepts is this new concept related to? Related concepts should always be one of the interfaces provided

Think about how each interface is used in a {system} process and write your intermediate results in the provided scratchpad.
        `)
    ]
    readonly systemMessages: SystemMessagePromptTemplate[] = [
        SystemMessagePromptTemplate.fromTemplate(`You are an expert in {system} and are defining business terms. Specifically you are looking for definitions related to the {function} function.`)
    ]

    readonly llmOutputSchema = z.object({
        thoughts: z.object({
            thought: z.string().describe("your current thought"),
            reasoning: z.string().describe("self reflect on why you made this decision"),
        }),
        related_concepts: z.array(z.object({
            concept_identifier: z.string().describe("The interface identifier of the existing concept as specified in the provided code."),
            reason: z.string().describe("A detailed reason on why this concept is related to the new concept"),
            probability: z.string().describe("The probability this concept is related to the new concept"),
        }).describe("A list of existing concepts that are related to the new concept"))
    })

    modelToUse(options: BaseCallContext): ChatOpenAI {
        return options.model4
    }

    async beforeLLM(input: ItemValues, callOptions: BaseCallContext): Promise<ItemValues> {
        const existing_concepts = await printConceptClasses({
            IncludeConceptDescriptions: true,
            IncludeProperties: false,
            IncludePropertyDescriptions: false,
            IncludeReferences: false
        })
        return {...input, existing_concepts: existing_concepts};
    }
    async afterLLM(input: ItemValues): Promise<ItemValues> {
        return {...input, related_concepts: (input.related_concepts as Record<string, string>[]).map(c => c.concept_identifier)}
    }
}

export class GetRootConceptFromConcepts extends BaseItem  {
    readonly name: string = "get_root_concept_from_related"
    readonly description: string = "Finds the root concept from a list of concepts."

    async call(runId: string, input: ItemValues, options: BaseCallContext, runManager: RunManger | undefined): Promise<ItemValues> {
        const rootConcept = await getRootConcept(input.related_concepts)
        return {rootConcept: rootConcept}
    }
}

export class GetRootConcept extends Chain implements ToolItem {
    inputSchema: ZodType = z.object({
        system: z.string().describe("The type of system the concept is defined in."),
        function: z.string().describe("The function or process in the specified system."),
        concept_identifier: z.string().describe("The name of the new concept that is being defined."),
        concept_definition: z.string().describe("A detailed definition of the new concept that is being defined."),
    })

  constructor() {
    super({
      name: "get_root_concept",
      description: `Returns the existing root concept related to a new concept`,
      outputValues: ["rootConcept"],
      children: [
        new GetConceptsRelatedToNewConcept(),
        new GetRootConceptFromConcepts()
      ]
    });
  }
}
