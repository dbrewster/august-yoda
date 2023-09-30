import {oClass, oProperty, SQLContext} from "@/obiwan/query/QueryClass";
import {getOrBuildConceptClasses} from "@/obiwan/query/BuildConceptClasses";
import {getConcept} from "@/obiwan/concepts/Concept";
import dotenv from "dotenv";

export const printConceptClass = async <T extends typeof oClass>(name: string, clazz: T, printOptions: PrintOptions) => {
  const sqlContext = new SQLContext()
  // @ts-ignore
  const instance = new clazz(sqlContext)
  instance.initializeProperties()
  const concept = await getConcept(name)
  let out = `interface ${name} extends InstanceType {\n`
  if (concept && printOptions.IncludeConceptDescriptions) {
    out = `/*\n${concept.description}\n*/\n` + out
  }
  out += Object.keys(instance).toSorted().filter(n => !n.startsWith("__")).map(n => {
    const property = instance[n]
    const propertyDescription = concept?.properties?.find(p => p.name == n)
    let description = ""
    if (printOptions.IncludePropertyDescriptions && propertyDescription) {
      description = ` // ${propertyDescription.description}`
    }
    if (printOptions.IncludeProperties && property instanceof oProperty) {
      return `    ${n}: ${property.getType()}, ${description}`
    } else if (printOptions.IncludeReferences && property instanceof oClass) {
      return `    ${n}: ${property.__id}, ${description}`
    } else {
      return null
    }
  }).filter(o => o != null).join("\n") + "\n"
  out += "}\n\n"

  return out
}

export const printConceptClasses = async (printOptions: PrintOptions, concepts?: string[]) => {
  const classes = await getOrBuildConceptClasses()
  const conceptsToPrint = concepts || Object.keys(classes)
  let ret = ""
  for (const name of conceptsToPrint) {
    ret += await printConceptClass(name, classes[name], printOptions)
  }
  return ret
}

export interface PrintOptions {
  IncludeConceptDescriptions: boolean,
  IncludePropertyDescriptions: boolean,
  IncludeProperties: boolean,
  IncludeReferences: boolean,
}
//
// dotenv.config()
// console.log(await printConceptClasses(true))
