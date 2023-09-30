import {BaseCallContext, BaseLLMItem, ItemValues} from "@/util/llm/BaseItem";
import {HumanMessagePromptTemplate, SystemMessagePromptTemplate} from "langchain/prompts";
import {z, ZodType} from "zod";
import {KnowledgeConcept, KnowledgeConceptProperty} from "@/obiwan/meta-concepts/MetaConcepts";
import {ChatOpenAI} from "langchain/chat_models/openai";
import {executeLLM} from "@/util/llm/Executor";
import {
  Concept,
  ConceptEdge,
  ConceptProperty,
  getConcept,
  upsertConcept,
  upsertConceptEdges
} from "@/obiwan/concepts/Concept";
import {buildConceptString, buildTableConceptsString} from "@/util/concept/BuildConceptText";
import {ConceptWithDescriptionOnly, PropertiesWithDescriptions} from "@/util/concept/ConceptWriter";

class FindMatchingFactTableForConcept extends BaseLLMItem {
  readonly name: string = "FindFactTableForBaseConcept";
  readonly description: string = "Finds the matching fact table for a base concept";

  readonly humanMessages: HumanMessagePromptTemplate[] = [
    HumanMessagePromptTemplate.fromTemplate(
      `You are finding a fact table matches a concept. The matching table MUST be a fact table that either references other dimensions or has measures that map to this concept. 
The table should match core of the concept and not related concepts. For example, if the description mentions concept A, that references concepts B and C, we are looking for concept A and not B, C. 

Given a set of tables and their descriptions:
---
{schema}
---

Which table matches the following concept:
***
{concept_identifier}
***
`
    )
  ];
  readonly systemMessages: SystemMessagePromptTemplate[] = [];

  readonly llmOutputSchema: ZodType = z.object({
    tables: z.array(z.object({
      name: z.string().describe("The name of the table from the schema"),
      description: z.string().describe("A new detailed description of the table derived from the table description and the given concept"),
      probability: z.number().describe("A value between 0 and 1 representing the probability the table matched, 0 being the lowest and 1 being an exact match")
    }))
  })

  async beforeLLM(input: ItemValues, callOptions: BaseCallContext): Promise<ItemValues> {
    const schema = await buildTableConceptsString(ConceptWithDescriptionOnly)

    const concept: KnowledgeConcept = input.concept
    return {...input, schema: schema, concept_identifier: concept.concept_identifier}
  }

  async afterLLM(input: ItemValues): Promise<ItemValues> {
    return {
      tables: (input.tables as ItemValues[]).filter(e => e.probability > 0.75).sort((a, b) => b.probability - a.probability).map(t => {
        return ({...t, logp: Math.log2(t.probability)})
      })
    }
  }
}

class FindMatchingColumnsForConceptProperty extends BaseLLMItem {
  readonly name: string = "FindMatchingColumnsForConceptProperty";
  readonly description: string = "Finds the matching fact table for a base concept";

  readonly humanMessages: HumanMessagePromptTemplate[] = [
    HumanMessagePromptTemplate.fromTemplate(
      `You are building expressions for property access in a table using the provided expression language.  

Given a table description
---
{schema}
---
And the following rows from the table:
***
{rows}
***

The expression grammar you can use is:
expression
    : term
    | expression '+' term
    | expression '-' term
    ;

term
    : factor
    | term '*' factor
    | term '/' factor
    | term '%' factor
    ;

factor
    : primary
    | '-' factor
    | '+' factor
    ;

primary
    : IDENTIFIER
    | INTEGER
    | FLOATING_POINT_LITERAL
    | '(' expression ')'
    ;
    
where IDENTIFIER is a column in the given object, ALWAYS prepended with "o."

Given the following definition:
***
{concept_identifier}
***

The match could contain a single column name or a combination of columns using the expression. For example:
"o.foobar"
"o.foobar + o.baz"
"(o.foobar - o.baz) * o.dingle"

Think about how you would compute an expression. Write out the steps to build the expression and why those are the correct steps before return the expression. 

DO NOT mix column types in one expression.

Include all expressions that might match and the probability it is correct. Use the description of each column in the schema to help you identify the correct answer`
    )
  ];
  readonly systemMessages: SystemMessagePromptTemplate[] = [];

  readonly llmOutputSchema: ZodType = z.object({
    scratchpad: z.string().describe("scratchpad used to reason about the solution"),
    expressions: z.array(z.object({
      scratchpad: z.string().describe("scratchpad used to reason about the solution for this expression"),
      expression: z.string().describe("an expression that best represents the definition. DO NOT use other grammar elements or prepend the any IDENTIFIER with anything other than o."),
      probability: z.number().describe("A value between 0 and 1 representing the probability the expression is accurate"),
    })).describe("All expressions that MIGHT match the definition."),
    description: z.string().describe("A new detailed description of the property computed from the given definition and the expression."),
    definition: z.string().describe("A new detailed definition of the computed property. Be specific about what this property is and how it is used in the industry."),
  })

  modelToUse(options: BaseCallContext): ChatOpenAI {
    return options.model4
  }

  async beforeLLM(input: ItemValues, callOptions: BaseCallContext): Promise<ItemValues> {
    const concept: Concept = input.concept
    const schema = buildConceptString(concept, PropertiesWithDescriptions)

    // now get sample data
    const rows = await callOptions.db.getRows(concept.name.slice("table_".length), 10)
    let rowsAsStr = "<no data>"
    if (rows?.length) {
      rowsAsStr = Object.keys(rows[0]).join(",") + "\n"
      rowsAsStr += rows.map(r => Object.values(r).join(",")).join("\n")
    }

    let property = input.concept_property as KnowledgeConceptProperty;
    return {...input, schema: schema, concept_identifier: property.concept_identifier, rows: rowsAsStr}
  }

  async afterLLM(input: ItemValues): Promise<ItemValues> {
    return {expressions: (input.expressions as ItemValues[]).filter(e => e.probability > 0.75).sort((a, b) => b.probability - a.probability)}
  }
}

export const buildBaseConcept = async (metaConcept: KnowledgeConcept) => {
  const tables = await executeLLM(new FindMatchingFactTableForConcept(), metaConcept.name, {concept: metaConcept}, "system").then(result => result.tables as Record<string, string>[])
  // todo -- look at probability and stuff
  const table = tables[0]

  const baseConcept = await getConcept(table.name)
  console.log("!!!", baseConcept)
  const concept = {
    name: metaConcept.name,
    friendlyName: metaConcept.friendlyName,
    description: table.description,
    properties: [] as ConceptProperty[]
  } as Concept

  for (const p of metaConcept.properties) {
    const builtProperties = await executeLLM(new FindMatchingColumnsForConceptProperty(), p.name, {concept_property: p, concept: baseConcept}, "system").then(o => o.expressions as ItemValues[])
    const builtProperty = builtProperties[0]
    concept.properties.push({
      name: p.name,
      type: p.type,
      friendlyName: p.friendlyName,
      expression: builtProperty.expression,
      description: builtProperty.description,
      probability: builtProperty.probability,
    })
  }

  await upsertConcept(concept)
  await upsertConceptEdges([{
    name: "stored_as",
    friendlyName:"Stored As",
    description: "Stored in the linked table",
    type: "__IS_A",
    source: concept.name,
    target: table.name
  } as ConceptEdge])

  // todo -- what should I do with the extra columns? Should I give them a probability that they are useful?
}





