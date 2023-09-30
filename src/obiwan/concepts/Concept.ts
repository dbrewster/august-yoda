import {SchemaColumnType} from "@/util/SchemaDefinitions";
import {mongoCollection} from "@/util/util";

export type ConceptType = ("Table" | "Concept")
export type ConceptPropertyType = SchemaColumnType

export interface Concept {
  name: string,
  tableName?: string,
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

export const getAllConceptEdges = async () => {
  const conceptCollection = await mongoCollection("concept_edge")
  return conceptCollection.find<ConceptEdge>({}, {projection:{_id:0}}).toArray()
}

export const getAllConcepts = async () => {
  const conceptCollection = await mongoCollection("concept")
  return conceptCollection.find<Concept>({}, {projection:{_id:0}}).toArray()
}

export const getConcept = async (name: string) => {
  const conceptCollection = await mongoCollection("concept")
  return conceptCollection.findOne<Concept>({name: name})
}

export const upsertConcept = async (concept: Concept) => {
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