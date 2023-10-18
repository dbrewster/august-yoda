import {Concept, ConceptEdge, ConceptProperty} from "@/obiwan/concepts/Concept";
import {
    BooleanProperty,
    DateProperty,
    DateTimeProperty,
    LinkProperty,
    NumberProperty,
    oClass,
    SQLContext,
    StringProperty,
    TimeProperty
} from "@/obiwan/concepts/QueryClass";
import _ from "underscore";
import {TypeSystem} from "@/obiwan/concepts/TypeSystem"

/*
class Opportunity extends oClass {
  constructor(sqlContext: SQLContext) {
    super(sqlContext, "id");
  }

  readonly amount = new NumberProperty(this, "amount")
  readonly probability= new NumberProperty(this, "probability")
  readonly stageName = new StringProperty(this, "stage_name")
  readonly account = new LinkProperty(this, Account, "account_id").link()
}

 */
export type Namespace = ("table" | "concepts")

const makePropertyFromConcept = (parent: oClass, property: ConceptProperty) => {
    switch (property.type.toLowerCase()) {
        case "boolean":
            return new BooleanProperty(parent, property.name, property.friendlyName, property.description, property.expression)
        case "string":
            return new StringProperty(parent, property.name, property.friendlyName, property.description, property.expression)
        case "number":
            return new NumberProperty(parent, property.name, property.friendlyName, property.description, property.expression)
        case "categorical":
            return new StringProperty(parent, property.name, property.friendlyName, property.description, property.expression)
        case "date":
            return new DateProperty(parent, property.name, property.friendlyName, property.description, property.expression)
        case "time":
            return new TimeProperty(parent, property.name, property.friendlyName, property.description, property.expression)
        case "datetime":
            return new DateTimeProperty(parent, property.name, property.friendlyName, property.description, property.expression)
        default:
            throw `Invalid property type requested: ${property.name}:${property.type}`
    }
}

const buildConceptClass = (info: ClassBuilderInfo) => {
    return class extends oClass {
        constructor(sqlContext: SQLContext) {
            super(sqlContext, info.typeSystem.typeSystemId, info.concept.name, info.concept.table_name, info.concept.description, info.concept.constraint_query);
        }

        initializeProperties() {
            info.concept.properties.forEach(prop => {
                this[prop.name] = makePropertyFromConcept(this, prop)
            })

            info.sourceEdges.filter(link => link.type == "__LINK").forEach(link => {
                const linkClass = info.typeSystem.getConceptClass(link.target)
                let linkProperty = new LinkProperty(this, () => linkClass, link.name, link.description, link.sourceProperties, link.targetProperties);
                this.__links[link.name] = linkProperty
                this[link.name] = linkProperty.link()
            })
        }
    }
}

interface ClassBuilderInfo {
    typeSystem: TypeSystem
    concept: Concept
    sourceEdges: ConceptEdge[]
    targetEdges: ConceptEdge[]
}

export function convertConceptsToClasses(typeSystem: TypeSystem, concepts: Concept[], edges: ConceptEdge[]) {
    const classBuilderInfo: Record<string, ClassBuilderInfo> = {}
    concepts.forEach(concept => {
        classBuilderInfo[concept.name] = {
            typeSystem: typeSystem,
            concept: {...concept},
            sourceEdges: [],
            targetEdges: [],
        }
    })

    edges.forEach(edge => {
        if (edge.type == "__LINK") {
            classBuilderInfo[edge.source].sourceEdges.push(edge)
            classBuilderInfo[edge.target].targetEdges.push(edge)
        }
    })

    const retClasses: Record<string, typeof oClass> = {}
    for (const key in classBuilderInfo) {
        const info = classBuilderInfo[key]
        retClasses[info.concept.name] = buildConceptClass(info)
    }

    return retClasses
}

export const getClosedGraph = async (typeSystem: TypeSystem, name: string) => {
    const allClasses = typeSystem.getAllClasses()
    if (!allClasses[name]) {
        return []
    }
    const sqlContext = new SQLContext()
    const classesToProcess = [name]
    const processedClasses = new Set<string>()
    while (classesToProcess.length > 0) {
        const classToProcess = classesToProcess.pop()
        if (classToProcess) {
            processedClasses.add(classToProcess)
            // @ts-ignore
            const instance = new allClasses[classToProcess](sqlContext)
            instance.initializeProperties()

            const linkedTypes = _(Object.keys(instance).toSorted().map(n => {
                if (!n.startsWith("__")) {
                    const property = instance[n]
                    if (property instanceof oClass) {
                        return property
                    }
                }
                return null
            }).filter(o => o != null).map(o => o!.__id).filter(c => !processedClasses.has(c))).uniq()
            classesToProcess.push(...linkedTypes)
        }
    }
    return Array.from(processedClasses.keys())
}


export const getRootConcept = async (typeSystem: TypeSystem, concepts: string[]) => {
    type GraphType = {
        name: string,
        graph: string[],
        leftover: string[]
    }

    const closedGraphsForEach: GraphType[] = []
    for (let startingObjectPos = 0; startingObjectPos < concepts.length; startingObjectPos++) {
        // start with the next item
        let concept = concepts[startingObjectPos];
        let graph = await getClosedGraph(typeSystem, concept);

        const leftOverConcepts = _(concepts).without(...graph)
        closedGraphsForEach.push({
            name: concept,
            graph,
            leftover: leftOverConcepts
        })
    }

    const list = _(closedGraphsForEach).sortBy(r => r.leftover.length)
    return list[0].name
}
