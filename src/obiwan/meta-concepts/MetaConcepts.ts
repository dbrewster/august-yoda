import YAML from 'yaml'
import fs from "node:fs";

export interface KnowledgeConceptProperty {
  name: string,
  friendlyName: string;
  type: ("string" | "date" | "number" | "categorical")
  concept_identifier: string,
}

export interface KnowledgeConcept {
  name: string,
  friendlyName: string;
  label: string,
  type: ("BaseConcept"),
  concept_identifier: string,
  properties: KnowledgeConceptProperty[]
}

export interface KnowledgeHub {
  name: string,
  label: string,
  concepts: KnowledgeConcept[]
}

export class MetaConcepts {
  readonly knowledgeHub: KnowledgeHub

  constructor(fileName: string) {
    const file = fs.readFileSync(`./src/obiwan/meta-concepts/${fileName}.yaml`, "utf8")
    this.knowledgeHub = YAML.parse(file)
  }

  hub() {
    return this.knowledgeHub
  }

  concept(concept: string): KnowledgeConcept | undefined {
    return this.knowledgeHub.concepts.find(p => p.name === concept)
  }
}
