import {oClass, oProperty, SQLContext} from "@/obiwan/concepts/QueryClass";
import {TypeSystem} from "@/obiwan/concepts/TypeSystem"

const typeToPropertyType: Record<string, string> = {
  "string": "String",
  "number": "Number",
  "boolean": "Boolean",
  "date": "Date",
  "time": "Time",
  "datetime": "DateTime"
}

export const printConceptClass = async <T extends typeof oClass>(name: string, clazz: T, printOptions: PrintOptions) => {
  const sqlContext = new SQLContext()
  // @ts-ignore
  const instance = new clazz(sqlContext)
  instance.initializeProperties()
  let out = `interface ${name} extends InstanceType {\n`
  if (instance.__description && printOptions.IncludeConceptDescriptions) {
    out = `/*\n${instance.__description}\n*/\n` + out
  }
  out += Object.keys(instance).toSorted().filter(n => !n.startsWith("__")).map(n => {
    const property = instance[n]
    if (printOptions.IncludeProperties && property instanceof oProperty) {
      const description = printOptions.IncludePropertyDescriptions ? ` // ${property.__description}` : ""
      return `    ${n}: ${typeToPropertyType[property.getType()]}, ${description}`
    } else if (printOptions.IncludeReferences && property instanceof oClass) {
      const link = instance.__links[n]
      const description = printOptions.IncludePropertyDescriptions ? ` // ${link.__description}` : ""
      return `    ${n}: ${property.__id}, ${description}`
    } else {
      return null
    }
  }).filter(o => o != null).join("\n") + "\n"
  out += "}\n\n"

  return out
}

export const printConceptClasses = async (typeSystem: TypeSystem, printOptions: PrintOptions, concepts?: string[]) => {
  const classes = typeSystem.getAllClasses()
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
// console.log(await printConceptClasses({
//             IncludeConceptDescriptions: true,
//             IncludeProperties: true,
//             IncludePropertyDescriptions: true,
//             IncludeReferences: true
//         }, undefined, true))
