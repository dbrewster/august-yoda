import {BaseCallContext, BaseLLMItem, ItemValues} from "@/util/llm/BaseItem";
import {HumanMessagePromptTemplate, SystemMessagePromptTemplate} from "langchain/prompts";
import {z, ZodType} from "zod";
import {ChatOpenAI} from "langchain/chat_models/openai";
import {executeLLM} from "@/util/llm/Executor";
import dotenv from "dotenv";
import {batchPromises, convertCamelCaseToLower, mongoCollection, snakeToPascalCase} from "@/util/util";
import {BuildSchemaText, TableSchema} from "@/yoda/table-text-generator/BuildSchemaText";
import {ObjectOutputWriter, serializeTables} from "@/yoda/table-text-generator/OutputWriter";
import {Concept, ConceptEdge, ConceptProperty, upsertConcept, upsertConceptEdges} from "@/obiwan/concepts/Concept";
import _ from "underscore";
import {findSchemaTable} from "@/util/SchemaDefinitions";
import {getClosedGraph} from "@/obiwan/code-gen/BuildConceptClasses";
import {printConceptClasses} from "@/obiwan/code-gen/PrintConceptInterfaces";
import {ToolItem} from "@/util/llm/Agent";

export class FindBaseConceptsFromTables extends BaseLLMItem {
    readonly name: string = "find_base_concepts_from_tables"
    readonly description: string = "Finds the primary objects of a given system"

    readonly humanMessages: HumanMessagePromptTemplate[] = [
        HumanMessagePromptTemplate.fromTemplate(`Given a set of tables and their descriptions:
---
{schema}
---

Think about how each object is used in a {system} process and write your intermediate results in the provided scratchpad. Include details about the object and how it relates to the key concepts in the {function} process.

Which of the given objects are the primary objects in a {system} system?
`)
    ]
    readonly systemMessages: SystemMessagePromptTemplate[] = [
        SystemMessagePromptTemplate.fromTemplate(`You are an expert in {system} and are defining business terms. Specifically you are looking for definitions related to the {function} function.`)
    ]

    readonly llmOutputSchema: ZodType = z.object({
        scratchpad: z.string().describe("scratchpad used to reason about the solution"),
        tables: z.array(z.object({
            table_name: z.string().describe("The name of the original object"),
            identifier: z.string().describe("A valid javascript identifier for the primary object"),
            friendlyName: z.string().describe("A human readable name for the object"),
            probability: z.number().describe("A value between 0 and 1 representing the probability the object is a primary object in the {system} system, 0 being the lowest and 1 being an exact match")
        }))
    })

    modelToUse(options: BaseCallContext): ChatOpenAI {
        return options.model4
    }


    async beforeLLM(input: ItemValues, callOptions: BaseCallContext): Promise<ItemValues> {
        const schemaBuilder = new BuildSchemaText()
        let tableOptions = {
            includeTableFKs: false,
            includeDescription: true,
            includeTablePK: false,
            includeTableType: false
        };
        const writer = new ObjectOutputWriter(tableOptions)
        const collection = await mongoCollection("schema")
        const tableNames: string[] = await collection.find({num_rows: {$gt: 0}}, {projection: {'name': 1}}).sort('name').map(t => t['name'].toString()).toArray()
        await schemaBuilder.buildTablesText(writer, "schema", tableNames)
        const tables = writer.buildAndClear()
        const schema = serializeTables(tables);
        return {...input, schema: schema};
    }
}

export class FindBaseConceptDetails extends BaseLLMItem implements ToolItem {
    readonly name: string = "find_base_concept_details"
    readonly description: string = "Returns the details for a concept, how it is used, and how it relates to the key concepts for a specified system for a particular process"

    readonly humanMessages: HumanMessagePromptTemplate[] = [
        HumanMessagePromptTemplate.fromTemplate(`Think about how the following topic is used in a {system} process. Include details about the object, how it is used, and how it relates to the key concepts in the {function} process.

What is a {concept}?`)
    ]
    readonly systemMessages: SystemMessagePromptTemplate[] = [
        SystemMessagePromptTemplate.fromTemplate(`You are an expert in customer relationship management and are defining business terms. Specifically you are looking for definitions related to the {function} function.`)
    ]

    readonly llmOutputSchema = undefined

    inputSchema: ZodType = z.object({
        system: z.string().describe("The type of system the concept is defined in."),
        function: z.string().describe("The function or process in the specified system."),
        concept_name: z.string().describe("The name of the concept to create a definition for."),
    })

    modelToUse(options: BaseCallContext): ChatOpenAI {
        return options.model4
    }
}


class FindBaseConceptPropertiesFromTables extends BaseLLMItem {
    readonly name: string = "find_base_concept_properties_from_table"
    readonly description: string = "Returns properties of a concept given the properties in a table"

    readonly humanMessages: HumanMessagePromptTemplate[] = [
        HumanMessagePromptTemplate.fromTemplate(`Given the schema for a table:
---
--{description}
{schema}
---
With the following sample 10 rows of data:
****
{data}
****

Think about how each table column is used in a {system} process and write your intermediate results in the provided scratchpad. Include details about the property and how it relates to the key concepts in the {function} process.

Which of the given columns are the primary properties of a {table_name} object in a {system} system?`)
    ]
    readonly systemMessages: SystemMessagePromptTemplate[] = [
        SystemMessagePromptTemplate.fromTemplate(`You are an expert in customer relationship management and are defining business terms. Specifically you are looking for definitions related to the {function} function.`)
    ]

    readonly llmOutputSchema = z.object({
        scratchpad: z.string().describe("scratchpad used to reason about the solution"),
        properties: z.array(z.object({
            name: z.string().describe("A legal javascript identifier for the property"),
            type: z.string().describe("The type of the column in the table"),
            expression: z.string().describe("The original column name in the table"),
            friendlyName: z.string().describe("A human readable name for the property"),
            definition: z.string().describe("A very detailed definition of the property"),
        })).describe("The functional properties of the given object")
    })

    modelToUse(options: BaseCallContext): ChatOpenAI {
        return options.model4
    }


    async beforeLLM(input: ItemValues, callOptions: BaseCallContext): Promise<ItemValues> {
        const tableWriter = new ObjectOutputWriter({
            includeTableFKs: false,
            includeDescription: false,
            includeTablePK: false,
            includeTableType: false
        }, {
            includeColumnDescriptions: false,
            includeColumnFKInfo: false,
            includeColumnPKInfo: false,
            includeOnlyFactColumns: true,
            includeColumnFriendlyName: false
        })
        const columns = input.columns as string[]
        await new BuildSchemaText().buildTableText(tableWriter, input.table_name, "schema", (table, col) => col.name in columns)
        let tables = tableWriter.buildAndClear();
        let tableSchema = serializeTables(tables)
        const rows = await callOptions.db.getRows(input.table_name, 5, columns)
        let data = "<no data>"
        if (rows?.length) {
            data = Object.keys(rows[0]).join(",") + "\n"
            data += rows.map(r => Object.values(r).join(",")).join("\n")
        }

        return {...input, schema: tableSchema, data: data};
    }
}

class FindBaseConceptEdgeDescriptions extends BaseLLMItem {
    readonly name: string = "find_base_concept_edge_descriptions"
    readonly description: string = "Returns properties of a concept"

    readonly humanMessages: HumanMessagePromptTemplate[] = [
        HumanMessagePromptTemplate.fromTemplate(`Given a collection of interfaces and their descriptions:
***
{interfaces}
***

Think about how the following topic is used in a {system} process and write your intermediate results in the provided scratchpad. Include details about the property, how the property might be used, and how it relates to the key concepts in the {function} process.

Create descriptions and human readable names for the following new properties:
***
{properties}
***
`)
    ]
    readonly systemMessages: SystemMessagePromptTemplate[] = [
        SystemMessagePromptTemplate.fromTemplate(`You are an expert in customer relationship management and are defining business terms. Specifically you are looking for definitions related to the {function} function.`)
    ]

    readonly llmOutputSchema = z.object({
        scratchpad: z.string().describe("scratchpad used to reason about the solution"),
        properties: z.array(z.object({
            name: z.string().describe("The original name of the property"),
            friendlyName: z.string().describe("A human readable name for the property"),
            description: z.string().describe("A very detailed definition of the property describing what and how it is used"),
        })).describe("The properties to find the information for")
    })

    modelToUse(options: BaseCallContext): ChatOpenAI {
        return options.model4
    }

    async beforeLLM(input: ItemValues, callOptions: BaseCallContext): Promise<ItemValues> {
        let concept_name = input.concept;
        const concepts = (await getClosedGraph("concepts", concept_name)).filter(n => n !== concept_name)
        let printOptions = {
            IncludeReferences: false,
            IncludeConceptDescriptions: true,
            IncludeProperties: false,
            IncludePropertyDescriptions: false
        };
        const interfaces = await printConceptClasses(printOptions, concepts)
        let properties = await printConceptClasses(printOptions, [concept_name])
        const newProperties = input.edges as ConceptEdge[]
        const insertPoint = properties.lastIndexOf("}")
        properties = properties.slice(0, insertPoint) + newProperties.map(edge => {
            return `    ${edge.name}:${edge.target}`
        }).join("\n") + "\n" + properties.slice(insertPoint)
        console.log(properties)
        return {...input, interfaces: interfaces, properties: properties};
    }
}


export const generateBaseConcepts = async (system: string, businessFunction: string) => {
    const baseConcepts = await executeLLM(new FindBaseConceptsFromTables(), "BaseConcepts", {system: system, function: businessFunction}, "system")
        .then(result => result.tables.map((table: Record<string, any>) => {
            return {
                name: snakeToPascalCase(convertCamelCaseToLower(table.identifier)),
                friendlyName: table.friendlyName,
                probability: table.probability,
                tableName: table.table_name,
                description: "",
                type: "Table",
                properties: []
            } as Concept
        }) as Concept[])

    const collection = await mongoCollection("concept")
    await collection.insertMany(baseConcepts)

    return baseConcepts
}

export const generateDescriptionsForBaseConcepts = async (system: string, businessFunction: string) => {
    const collection = await mongoCollection("concept")
    const concepts = await collection.find<Concept>({type: "Table"}).toArray()
    const promises = concepts.map(concept => {
        return executeLLM(new FindBaseConceptDetails(), "BaseConcepts", {system: system, function: businessFunction, concept: concept.friendlyName}, "system").then((result: ItemValues) => {
            concept.description = result.result
            return upsertConcept(concept).then(v => concept)
        })
    })
    return await batchPromises<Concept>(promises, 10)
}

export const generatePropertiesForBaseConcepts = async (system: string, businessFunction: string) => {
    const collection = await mongoCollection("concept")
    const concepts = await collection.find<Concept>({type: "Table"}).toArray()
    const promises = concepts.filter(concept => !concept.properties || concept.properties.length == 0).map(concept => {
        return mongoCollection("schema").then(collection => {
            return collection.findOne<TableSchema>({name: concept.tableName}).then(table => {
                const columns = table!.columns.filter(c => c.num_null != table?.num_rows)
                const chunks = _(columns).chunk(50)
                return Promise.all(chunks.map(chunk => {
                    return executeLLM(new FindBaseConceptPropertiesFromTables(), "BaseConcepts",
                        {system: system, function: businessFunction, table_name: concept.tableName, description: concept.description, columns: chunk.map(c => c.name)}, "system")
                        .then(propResult => {
                            return (propResult.properties as Record<string, any>[]).map(prop => {
                                return ({
                                    type: prop.type,
                                    name: prop.name,
                                    friendlyName: prop.friendlyName,
                                    expression: prop.expression,
                                    description: prop.definition,
                                    probability: 0
                                }) as ConceptProperty
                            })
                        })
                })).then(properties => {
                    concept.properties = properties.flat()
                    return upsertConcept(concept).then(v => concept)
                })
            })
        })
    })
    return await batchPromises<Concept>(promises, 5)
}

export const generateBaseConceptEdges = async (system: string, businessFunction: string) => {
    const schemaCollection = await mongoCollection("schema")
    const collection = await mongoCollection("concept")
    const concepts = await collection.find<Concept>({type: "Table"}).toArray()
    const tableNames = new Set(concepts.map(c => c.tableName!))

    const promises = concepts.map(async concept => {
        const t = (await findSchemaTable(concept.tableName!))!
        const edgesForConcept = t.foreign_keys.map(fk => {
            const fkColumns = fk.constrained_columns.map(c => t.columns.find(sc => sc.name == c)!)
            if (tableNames.has(fk.referred_table) && (fkColumns.every(v => v.num_null != t.num_rows))) {
                return {
                    name: convertCamelCaseToLower(fk.name.replace("_c", "")),
                    type: "__LINK",
                    friendlyName: "",
                    description: "",
                    source: concept.name,
                    sourceProperties: fk.constrained_columns,
                    target: concepts.find(c => c.tableName === fk.referred_table)?.name,
                    targetProperties: fk.referred_columns
                } as ConceptEdge
            }
            return null
        }).filter(e => e != null).map(e => e!)
        if (edgesForConcept.length > 0) {
            await upsertConceptEdges(edgesForConcept)
            return executeLLM(new FindBaseConceptEdgeDescriptions(), "BaseConcepts", {system: system, function: businessFunction, concept: concept.name, edges: edgesForConcept}, "system")
                .then(result => (result.properties as Record<string, string>[]).map(property => {
                    const edge = edgesForConcept.find(e => e.name === property.name)
                    if (!edge) {
                        console.error("Could not find edge for property ", property)
                    } else {
                        edge.description = property.description
                        edge.friendlyName = property.friendlyName
                    }
                    return edge
                }).filter(e => e).map(e => e!)).then(edges => {
                    return upsertConceptEdges(edges).then(v => edges)
                })
        } else {
            return []
        }
    })
    const edges = await batchPromises<ConceptEdge[]>(promises, 10)
    return edges.flat()
}

dotenv.config()
console.log(JSON.stringify(await generateBaseConcepts("CRM", "revenue reporting"), null, 1))
console.log(JSON.stringify(await generateDescriptionsForBaseConcepts("CRM", "revenue reporting"), null, 1))
console.log(JSON.stringify(await generatePropertiesForBaseConcepts("CRM", "revenue reporting"), null, 1))
console.log(JSON.stringify(await generateBaseConceptEdges("CRM", "revenue reporting"), null, 1))
