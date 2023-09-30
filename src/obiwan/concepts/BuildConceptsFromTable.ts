import {Concept, ConceptEdge, upsertConcept, upsertConceptEdges} from "@/obiwan/concepts/Concept";
import {findSchemaTable, findSchemaTables} from "@/util/SchemaDefinitions";
import dotenv from "dotenv";


export const buildConceptFromTable = async (tableName: string, includeEmptyTables: boolean, includeNullColumns: boolean) => {
  const table = await findSchemaTable(tableName)
  if (table) {
    const columns = table.columns.filter(c => includeNullColumns || c.num_null != table.num_rows)
    const concept = {
      name: "table_" + table.name,
      type: "Table",
      friendlyName: table.friendly_name,
      description: table.description,
      properties: columns.map((col) => ({
        name: col.name,
        type: col.type,
        friendlyName: col.friendly_name,
        description: col.description,
        expression: ""
      }))
    } as Concept

    await upsertConcept(concept)
    return concept
  }
}

export const buildConceptsFromTables = async (includeEmptyTables: boolean, includeNullColumns: boolean) => {
  const tables = await findSchemaTables()
  var tableNames: Set<string>
  if (includeEmptyTables) {
    tableNames = new Set(tables.map(t => t.name))
  } else {
    tableNames = new Set(tables.filter(t => t.num_rows > 0).map(t => t.name))
  }
  const concepts: Record<string, Concept> = {}
  for (const t of tables) {
    if (includeEmptyTables || t.num_rows > 0) {
      const concept = await buildConceptFromTable(t.name, includeEmptyTables, includeNullColumns)
      if (concept) {
        concepts[concept.name] = concept
      }
    }
  }

  // now build FK references

  const edges = tables.flatMap(t => {
    if (includeEmptyTables || t.num_rows > 0) {
      return t.foreign_keys.map(fk => {
        const fkColumns = fk.constrained_columns.map(c => t.columns.find(sc => sc.name == c)!)
        if (tableNames.has(fk.referred_table) && (includeNullColumns || fkColumns.every(v => v.num_null != t.num_rows))) {
          const thisConcept = concepts["table_" + t.name]
          return {
            name: fk.name,
            type: "__LINK",
            friendlyName: fkColumns[0].description,
            description: fkColumns[0].description,
            source: "table_" + t.name,
            sourceProperties: fk.constrained_columns,
            target: "table_" + fk.referred_table,
            targetProperties: fk.referred_columns
          } as ConceptEdge
        }
      }).filter(e => e != null).map(e => e!)
    } else {
      return null
    }
  }).filter(t => t != null).map(t => t!)
  return upsertConceptEdges(edges)
}

dotenv.config()

await buildConceptsFromTables(false, false)