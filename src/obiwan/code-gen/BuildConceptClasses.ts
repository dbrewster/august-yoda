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
import _ from "underscore";
import {buildConceptsFromTables} from "@/obiwan/code-gen/BuildConceptsFromTable";

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

let allClasses: Record<string, typeof oClass> = {}
let allClassesFromTables: Record<string, typeof oClass> = {}

const makePropertyFromConcept = (parent: oClass, property: ConceptProperty) => {
  switch (property.type) {
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
  }
}

const buildConceptClass = (info: ClassBuilderInfo) => {
  return class extends oClass {
    constructor(sqlContext: SQLContext) {
      super(sqlContext, info.namespace, info.concept.name, info.concept.tableName, info.concept.description, info.baseConcepts);
    }

    initializeProperties() {
      info.concept.properties.forEach(prop => {
        this[prop.name] = makePropertyFromConcept(this, prop)
      })
      const classesInNamespace = this.__namespace === "table" ? allClassesFromTables : allClasses
      info.sourceEdges.filter(link => link.type == "__LINK").forEach(link => {
        let linkProperty = new LinkProperty(this, () => classesInNamespace[link.target], link.name, link.description, link.sourceProperties, link.targetProperties);
        this.__links[link.name] = linkProperty
        this[link.name] = linkProperty.link()
      })
    }
  }
}

interface ClassBuilderInfo {
  namespace: Namespace
  concept: Concept
  sourceEdges: ConceptEdge[]
  targetEdges: ConceptEdge[]
  baseConcepts: string[]
}

function convertConceptsToClasses(namespace: Namespace, concepts: Concept[], edges: ConceptEdge[]) {
  const classBuilderInfo: Record<string, ClassBuilderInfo> = {}
  concepts.forEach(concept => {
    classBuilderInfo[concept.name] = {
      namespace: namespace,
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

  const retClasses: Record<string, typeof oClass> = {}
  for (const key in classBuilderInfo) {
    const info = classBuilderInfo[key]
    retClasses[info.concept.name] = buildConceptClass(info)
  }

  return retClasses
}

const reBuildAllConceptClasses = async () => {
  const concepts = await getAllConcepts()
  const edges = await getAllConceptEdges()
  allClasses = convertConceptsToClasses("concepts", concepts, edges);
}

export const getOrBuildConceptClasses = async (namespace: Namespace) => {
  if (namespace == "concepts") {
    if (Object.keys(allClasses).length == 0) {
      await reBuildAllConceptClasses()
    }
    return allClasses
  } else {
  if (Object.keys(allClassesFromTables).length == 0) {
    await reBuildAllConceptClassesFromTables()
  }
  return allClassesFromTables
  }
}

const reBuildAllConceptClassesFromTables = async () => {
  const {concepts, edges} = await buildConceptsFromTables(false, false)
  allClassesFromTables = convertConceptsToClasses("table", concepts, edges);
}

export const getClosedGraph = async (namespace: Namespace, name: string) => {
  const allClasses = await getOrBuildConceptClasses(namespace)
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


export const getRootConcept = async (concepts: string[]) => {
  type GraphType = {
    name: string,
    graph: string[],
    leftover: string[]
  }

  const closedGraphsForEach: GraphType[] = []
  for (let startingObjectPos = 0; startingObjectPos < concepts.length; startingObjectPos++) {
    // start with the next item
    let concept = concepts[startingObjectPos];
    let graph = await getClosedGraph("concepts", concept);

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
