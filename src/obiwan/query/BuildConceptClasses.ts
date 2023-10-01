import {Concept, ConceptEdge, ConceptProperty, getAllConceptEdges, getAllConcepts} from "@/obiwan/concepts/Concept";
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
} from "@/obiwan/query/QueryClass";

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
let allClasses: Record<string, typeof oClass> = {}

const makePropertyFromConcept = (parent: oClass, property: ConceptProperty) => {
  switch (property.type) {
    case "boolean":
      return new BooleanProperty(parent, property.name, property.friendlyName, property.expression)
    case "string":
      return new StringProperty(parent, property.name, property.friendlyName, property.expression)
    case "number":
      return new NumberProperty(parent, property.name, property.friendlyName, property.expression)
    case "categorical":
      return new StringProperty(parent, property.name, property.friendlyName, property.expression)
    case "date":
      return new DateProperty(parent, property.name, property.friendlyName, property.expression)
    case "time":
      return new TimeProperty(parent, property.name, property.friendlyName, property.expression)
    case "datetime":
      return new DateTimeProperty(parent, property.name, property.friendlyName, property.expression)
  }
}

const buildConceptClass = (info: ClassBuilderInfo) => {
  return class extends oClass {
    constructor(sqlContext: SQLContext) {
      super(sqlContext, info.concept.name, info.concept.tableName, info.baseConcepts);
    }

    initializeProperties() {
      info.concept.properties.forEach(prop => {
        this[prop.name] = makePropertyFromConcept(this, prop)
      })
      info.sourceEdges.filter(link => link.type == "__LINK").forEach(link => {
        this[link.name] = new LinkProperty(this, () => allClasses[link.target], link.name, link.sourceProperties, link.targetProperties).link()
      })
    }
  }
}

interface ClassBuilderInfo {
  concept: Concept
  sourceEdges: ConceptEdge[]
  targetEdges: ConceptEdge[]
  baseConcepts: string[]
}

export const reBuildAllConceptClasses = async () => {
  const concepts = await getAllConcepts()
  const edges = await getAllConceptEdges()

  const classBuilderInfo: Record<string, ClassBuilderInfo> = {}
  concepts.forEach(concept => {
    classBuilderInfo[concept.name] = {
      concept: {...concept},
      sourceEdges: [],
      targetEdges: [],
      baseConcepts: []
    }
  })

  edges.forEach(edge => {
    if (edge.type == "__LINK") {
      classBuilderInfo[edge.source].sourceEdges.push(edge)
      classBuilderInfo[edge.target].targetEdges.push(edge)
    } else if (edge.type == "__IS_A") {
      classBuilderInfo[edge.source].baseConcepts.push(edge.target)
    }
  })

  allClasses = {}
  for (const key in classBuilderInfo) {
    const info = classBuilderInfo[key]
    allClasses[info.concept.name] = buildConceptClass(info)
  }
}

export const getOrBuildConceptClasses = async () => {
  if (Object.keys(allClasses).length == 0) {
    await reBuildAllConceptClasses()
  }
  return allClasses
}

export const getClosedGraph = async (name: string) => {
  const allClasses = await getOrBuildConceptClasses()
  const sqlContext = new SQLContext()
  const classesToProcess = [name]
  const processedClasses = new Set<string>()
  while (classesToProcess.length > 0) {
    const classToProcess = classesToProcess.pop()
    if (classToProcess) {
      processedClasses.add(classToProcess)
      // @ts-ignore
      const instance = new allClasses[name](sqlContext)
      instance.initializeProperties()

      const linkedTypes = Object.keys(instance).toSorted().map(n => {
        if (!n.startsWith("__")) {
          const property = instance[n]
          if (property instanceof oClass) {
            return property
          }
        }
        return null
      }).filter(o => o != null).map(o => o!.__id).filter(c => !processedClasses.has(c))
      classesToProcess.push(...linkedTypes)
    }
  }
  return Array.from(processedClasses.keys())
}

