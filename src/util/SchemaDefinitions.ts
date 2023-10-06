import {mongoCollection} from "@/util/util";

export type SchemaColumnType = ("string" | "number" | "boolean" | "date" | "time" | "datetime" | "categorical")
export interface SchemaColumn {
  name: string
  is_fk: boolean
  is_pk: boolean
  num_null: number
  num_distinct: number
  value_frequencies: Record<string, number> | undefined
  type: SchemaColumnType
}

export interface SchemaFK {
  name: string,
  constrained_columns: string[]
  referred_table: string
  referred_columns: string[]
}

export interface SchemaTable {
  name: string
  num_rows: number
  primary_keys: string[]
  columns: SchemaColumn[]
  foreign_keys: SchemaFK[]
}

export interface SchemaDescriptionColumn {
  name: string,
  friendly_name: string,
  description: string,
  definition: string,
}

export interface SchemaDescriptionTable {
  name: string,
  friendly_name: string,
  description: string,
  definition: string,
  columns: SchemaDescriptionColumn[]
}

export interface SchemaColumnWithDescription extends SchemaColumn {
  friendly_name: string,
  description: string,
}

export interface SchemaTableWithDescription extends SchemaTable {
  friendly_name: string,
  description: string,
  columns: SchemaColumnWithDescription[]
}

export const findSchemaTable = async (tableName: string) => {
  const collection = await mongoCollection("schema")
  const table = await collection.findOne<SchemaTable>({name: tableName})
  if (!table) {
    return undefined
  }
  const descriptionCollection = await mongoCollection("schema_descriptions")
  const tableDescription = (await descriptionCollection.findOne<SchemaDescriptionTable>({name: tableName}))!
  return {...table,
    description: tableDescription.description,
    friendly_name: tableDescription.friendly_name,
    columns: table.columns.map(c => {
      const desc = tableDescription.columns.find(cd => cd.name == c.name)!
      return {
        ...c,
        description: desc.description,
        friendly_name: desc.friendly_name
      } as SchemaColumnWithDescription
    })
  } as SchemaTableWithDescription
}

export const findSchemaTables = async () => {
  const collection = await mongoCollection("schema")
  const table = (await collection.find<SchemaTable>({}).toArray()).sort((a, b) => a.name.localeCompare(b.name))
  const descriptionCollection = await mongoCollection("schema_descriptions")
  const tableDescription = (await descriptionCollection.find<SchemaDescriptionTable>({}).toArray()).sort((a, b) => a.name.localeCompare(b.name))
  return table.map((t, i) => {
    const td = tableDescription[i]
    if (t.name !== td.name) {
      throw Error("WTH!!!")
    }
    const sColumns = t.columns.sort((a, b) => a.name.localeCompare(b.name))
    const sdColumns = td.columns.sort((a, b) => a.name.localeCompare(b.name))
    const columns = sColumns.map((c, i) => {
      const descCol = sdColumns[i]
      if (c.name !== descCol.name) {
        console.log(sColumns.map(c => c.name), sdColumns.map(c => c.name))
        throw Error(`WTH!!! c:${c.name} !== dc:${descCol.name}`)
      }
      return ({
        ...c,
        friendly_name: descCol.friendly_name,
        description: descCol.description
      } as SchemaColumnWithDescription)
    })

    return ({
      ...t,
      friendly_name: td.friendly_name,
      description: td.description,
      columns: columns
    } as SchemaTableWithDescription)
  })
}