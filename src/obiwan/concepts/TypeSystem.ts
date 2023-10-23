/*
  Holds a change list of change for concepts as one unit.
 */
import {Concept, ConceptEdge, getAllConceptEdges, getAllConcepts} from "@/obiwan/concepts/Concept"
import {oClass} from "@/obiwan/concepts/QueryClass"
import {convertConceptsToClasses} from "@/obiwan/concepts/BuildConceptClasses"
import {buildConceptsFromTables} from "@/obiwan/concepts/BuildConceptsFromTable"

export class TypeSystem {
    typeSystemId: string
    isBuilt = false
    concepts: Record<string, Concept> = {}
    concept_edges: ConceptEdge[] = []
    concept_classes: Record<string, typeof oClass> = {}

    constructor(typeSystemId: string) {
        this.typeSystemId = typeSystemId
    }

    getConceptClass(name: string) {
        return this.concept_classes[name]
    }

    getConcept(name: string) {
        return this.concepts[name]
    }

    getConceptEdges() {
        return this.concept_edges
    }

    getAllConcepts() {
        return Object.values(this.concepts)
    }

    getAllClasses() {
        return this.concept_classes
    }

    async triggerConceptChange(conceptName: string) {
        this.isBuilt = false
        await this.ensureBuilt()
    }

    async ensureBuilt() {
        if (!this.isBuilt) {
            // be careful to not overwrite the pointers in this until after this is done else we will have inconsistent pointers in this typesystem
            const concepts: Record<string, Concept> = {}
            const dbConcepts = await getAllConcepts(this.typeSystemId)
            dbConcepts.forEach(concept => {
                concepts[concept.name] = concept
            })

            const dbEdges = await getAllConceptEdges(this.typeSystemId)

            const {concepts: tableConcepts, edges: tableEdges} = await buildConceptsFromTables(false, false)
            tableConcepts.forEach(concept => {
                concepts[concept.name] = concept
            })

            let conceptClasses = convertConceptsToClasses(this, dbConcepts, dbEdges);
            conceptClasses = {...conceptClasses, ...convertConceptsToClasses(this, tableConcepts, tableEdges)}

            this.concepts = concepts
            this.concept_edges = dbEdges.concat(...tableEdges)
            this.concept_classes = conceptClasses
        }
    }
}

export const ROOT_TYPE_SYSTEM = "root"
const allTypeSystems: Record<string, TypeSystem> = {}

export async function getTypeSystem(id: string) {
    if (!allTypeSystems[id]) {
        allTypeSystems[id] = new TypeSystem(id)
    }
    await allTypeSystems[id].ensureBuilt()
    return allTypeSystems[id]
}
