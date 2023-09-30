import {ConceptOutOptions, ConceptWriter, serializeConcepts} from "@/util/concept/ConceptWriter";
import {Concept} from "@/obiwan/concepts/Concept";
import {mongoCollection} from "@/util/util";


export const writeConcept = (writer: ConceptWriter, concept: Concept) => {
  writer.writeConceptStart(concept.name, concept.description)
  concept.properties.forEach(prop => {
    writer.writePropertyStart(prop.name, prop.type, prop.description)
  })
  writer.writePropertiesEnd()
  writer.writeConceptEnd()
}

export const buildConceptString = (concept: Concept, options: ConceptOutOptions) => {
  const writer = new ConceptWriter(options)
  writeConcept(writer, concept)
  return serializeConcepts(writer.output)
}

export const buildTableConceptsString = async (options: ConceptOutOptions) => {
  const collection = await mongoCollection("concept")
  const tableConcepts = await collection.find<Concept>({type: "Table"}).toArray()
  return tableConcepts.map(concept => buildConceptString(concept, options)).join("\n")
}
