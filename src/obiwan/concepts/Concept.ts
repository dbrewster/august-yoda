import {SchemaColumnType} from "@/util/SchemaDefinitions";
import {mongoCollection} from "@/util/util";
import {getTypeSystem} from "@/obiwan/concepts/TypeSystem"

export type ConceptType = ("Table" | "Concept")
export type ConceptPropertyType = SchemaColumnType

export interface Concept {
  typeSystemId: string,
  system: string,
  process: string,
  name: string,
  base_concept: string,
  table_name?: string, // only used for auto-generated types from DB
  constraint_query: string
  type: ConceptType,
  friendlyName: string,
  description: string
  properties: ConceptProperty[]
}

export interface ConceptProperty {
  type: ConceptPropertyType
  name: string,
  friendlyName: string,
  description: string
  expression: string,
  probability: number
}

export type ConceptEdgeType = ("__IS_A" | "__CONSTRAINS" | "__LINK")

export interface ConceptEdge {
  type: ConceptEdgeType,
  name: string,
  friendlyName: string,
  description: string,
  source: string,
  sourceProperties: string[]
  target: string
  targetProperties: string[]
}

export const getAllConceptEdges = async (typeSystemId: string) => {
  const conceptCollection = await mongoCollection("concept_edge")
  return conceptCollection.find<ConceptEdge>({}, {projection:{_id:0}}).toArray()
}

export const getAllConcepts = async (typeSystemId: string) => {
  const conceptCollection = await mongoCollection("concept")
  return conceptCollection.find<Concept>({}, {projection:{_id:0}}).toArray()
}

export const upsertConcept = async (concept: Concept) => {
  const typeSystem = await getTypeSystem(concept.typeSystemId)
  await typeSystem.triggerConceptChange(concept.name)
  const conceptCollection = await mongoCollection("concept")
  return conceptCollection.updateOne({name: concept.name}, {$set: concept}, {upsert: true})
}

export const upsertConceptEdges = async (edges: ConceptEdge[]) => {
  const conceptCollection = await mongoCollection("concept_edge")
  for (const edge of edges) {
    await conceptCollection.updateOne({source: edge.source, target: edge.target, name: edge.name}, {$set: edge}, {upsert: true})
  }
  return Promise.resolve(edges.length)
}
