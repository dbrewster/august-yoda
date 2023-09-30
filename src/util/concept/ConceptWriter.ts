import {ConceptEdge, ConceptEdgeType, ConceptPropertyType} from "@/obiwan/concepts/Concept";

export class ConceptWriter {
  options: ConceptOutOptions;

  constructor(options: ConceptOutOptions) {
    this.options = options;
  }

  output: ConceptOut[] = [];
  currTable?: ConceptOut

  edges: ConceptEdgeOut[] = []

  writeConceptEnd(): void {
    if (this.currTable) this.output.push(this.currTable)
  }

  writeConceptStart(name: string, description?: string): void {
    this.currTable = {name: name}
    if (this.options.includeConceptDescription && description) {
      this.currTable.description = description
    }
  }

  writePropertyStart(name: string, type: ConceptPropertyType, description?: string): void {
    if (this.options.includeProperties) {
      const property: ConceptPropertyOut = {
        name: name,
        type: type
      }
      if (description && this.options.includePropertyDescription) {
        property.description = description
      }

      if (!this.currTable!.properties) this.currTable!.properties = []
      this.currTable!.properties.push(property)
    }
  }

  writePropertiesEnd(): void {
  }

  writeConceptEdge(edge: ConceptEdge) {
    const out: ConceptEdgeOut = {
      name: edge.name,
      type: edge.type,
      source: edge.source,
      target: edge.target
    }
    if (this.options.includeEdgeDescription) {
      out.description = edge.description
    }
    this.edges.push(out)
  }

  buildAndClear(): ConceptOut[] {
    const ret = this.output;
    this.output = [];
    return ret;
  }
}

export interface ConceptPropertyOut {
  name: string,
  type: ConceptPropertyType
  description?: string
}

export interface ConceptEdgeOut {
  type: ConceptEdgeType,
  name: string,
  description?: string,
  source: string,
  target: string
}

export interface ConceptOut {
  name: string,
  description?: string
  properties?: ConceptPropertyOut[]
}

export const serializePropertyOut = (indent: string, property: ConceptPropertyOut) => {
  let output = indent + `${property.name}:${property.type},`;

  if (property.description != null) {
    output += `-- ${property.description}`;
  }
  output += "\n";
  return output
}

export const serializeConceptOut = (concept: ConceptOut) => {
  let output = `NODE ${concept.name} (  `

  if (concept.description) {
    output = "-- " + concept.description + "\n" + output
  }

  if (concept.properties) {
    output += concept.properties.map(prop => serializePropertyOut("  ", prop)).join("\n")
  }
  output += `)\n`

  return output
}

export const serializeConcepts = (concepts: ConceptOut[]) => {
  let output = ""
  for (const concept of concepts) {
    output += serializeConceptOut(concept)
  }
  return output
}

export const serializeEdge = (edge: ConceptEdgeOut) => {
  let output =
    `EDGE ${edge.name} (  
  type: ${edge.type}
  source: ${edge.source}
  target: ${edge.target}
)`

  if (edge.description) {
    output = "-- " + edge.description + "\n" + output
  }

  return output
}

export const serializeEdges = (edges: ConceptEdgeOut[]) => {
  let output = ""
  for (const edge of edges) {
    output += serializeEdge(edge)
  }
  return output
}

export interface ConceptOutOptions {
  includeConceptDescription: boolean
  includePropertyDescription: boolean
  includeEdgeDescription: boolean
  includeProperties: boolean
}

export const PropertiesWithDescriptions = {
  includeProperties: true,
  includePropertyDescription: true,
  includeConceptDescription: true,
  includeEdgeDescription: true
} as ConceptOutOptions

export const ConceptWithDescriptionOnly = {
  includeProperties: false,
  includePropertyDescription: false,
  includeConceptDescription: true,
  includeEdgeDescription: true
} as ConceptOutOptions
