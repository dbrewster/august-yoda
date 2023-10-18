import {mongoCollection} from "@/util/util";
import {OutputWriter} from "@/yoda/table-text-generator/OutputWriter";

export interface SchemaColumn {
  name: string;
  type: string;
  nullable: boolean;
  is_pk: boolean;
  is_fk: boolean;
  num_null: number
  friendlyName?: string;
  description?: string;
}

export interface ForeignKey {
  name: string
  constrained_columns: string[]
  referred_table: string
  referred_columns: string[]
}

export interface TableSchema {
  name: string;
  num_rows: number;
  primary_keys: string[];
  foreign_keys: ForeignKey[];
  columns: SchemaColumn[];
}

export interface DescriptionSchemaColumn {
  name: string
  friendlyName: string
  description: string
}

export interface DescriptionTableSchema {
  name: string
  friendlyName: string
  isDimensionTable: boolean
  description: string
  columns: DescriptionSchemaColumn[]
}

export class BuildSchemaText {

  async buildTableText(
    writer: OutputWriter<any>,
    tableName: string,
    collectionName: string = "schema",
    columnsToInclude: ((table: TableSchema, column: SchemaColumn) => boolean) | null = null
  ) {
    writer.writeTableStart();
    const schemaTable: TableSchema = await mongoCollection(collectionName).then(collection => {
      return collection.findOne({'name': tableName}, {projection: {'_id': 0}}).then(res => res as any)
    })
    const schemaDescriptionTable: DescriptionTableSchema = await mongoCollection("schema_descriptions").then(collection => {
      return collection.findOne({'name': tableName}, {projection: {'_id': 0}}).then(res => res as any)
    })

    const hasSchemaDescriptionEntry = schemaDescriptionTable && Object.keys(schemaDescriptionTable).length > 0;

    let table_type = '';
    if (hasSchemaDescriptionEntry) {
      if (schemaDescriptionTable.isDimensionTable) {
        table_type = 'dimension ';
      } else {
        table_type = 'fact ';
      }
    }

    if (!schemaTable || !schemaTable.name) {
      console.error("Could not find table", tableName, "in collection", collectionName)
    }

    writer.writeTableName(
      schemaTable['name'],
      table_type,
      schemaTable.num_rows,
      hasSchemaDescriptionEntry ? schemaDescriptionTable.description : undefined
    );

    writer.writePrimaryKeys(schemaTable['primary_keys']);
    writer.writeForeignKeys(schemaTable['foreign_keys']);
    writer.writeColumnsStart();

    let combinedColumns = schemaTable.columns;
    if (hasSchemaDescriptionEntry) {
      const schemaDescriptionColumns = schemaDescriptionTable.columns;

      for (const col of combinedColumns) {
        const descCol = schemaDescriptionColumns.find(x => x.name === col.name);
        if (descCol) {
          col.friendlyName = descCol.friendlyName
          col.description = descCol.description
        }
      }
    }
    if (columnsToInclude) {
      combinedColumns = combinedColumns.filter(col => columnsToInclude(schemaTable, col))
    }

    for (const col of combinedColumns) {
      writer.writeColumn(col);
    }
    writer.writeColumnsEnd()
    writer.writeTableEnd();
  }

  async buildTablesText(
    writer: OutputWriter<any>,
    collectionName: string = "schema",
    tables: string[] | null = null
  ) {
    await mongoCollection(collectionName).then(async collection => {
      let table_names = await (tables
          ? collection.find({'name': {'$in': tables}}, {projection: {'name': 1}}).sort('name').map(t => t['name'].toString()).toArray()
          : collection.find({}, {projection: {'name': 1}}).sort('name').map(t => t['name'].toString()).toArray()
      )
      for (const table of table_names) {
        await this.buildTableText(writer, table, collectionName);
      }
    })
  }
}
