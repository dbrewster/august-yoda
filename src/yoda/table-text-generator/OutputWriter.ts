import {ForeignKey, SchemaColumn} from "@/yoda/table-text-generator/BuildSchemaText.js";

export abstract class OutputWriter<T> {
  tableOptions: TableOptions;
  columnOptions: ColumnOptions | null;

  constructor(tableOptions: TableOptions, columnOptions: ColumnOptions | null = null) {
    this.tableOptions = tableOptions;
    this.columnOptions = columnOptions;
  }

  abstract writeTableName(name: string, tableType: string, numRows: number, description?: string): void;

  abstract writePrimaryKeys(pks: string[]): void;

  abstract writeForeignKeys(fks: ForeignKey[]): void;

  abstract writeColumnsStart(): void;

  abstract writeColumn(column: SchemaColumn): void;

  abstract writeColumnsEnd(): void;

  abstract writeTableStart(): void;

  abstract writeTableEnd(): void;

  abstract buildAndClear(): T;
}

export class TextOutputWriter extends OutputWriter<string> {
  output: string = "";
  curr_table: string | null = null;

  writeTableName(name: string, table_type: string, numRows:number, description?: string): void {
    this.curr_table = name;
    if (!this.tableOptions.includeTableType) {
      table_type = '';
    }
    this.output += `${table_type}table: ${name}`;
    if (this.tableOptions.includeDescription && description) {
      this.output += `,description:\`${description}\``;
    }
    this.output += "\n";
  }

  writePrimaryKeys(pks: string[]): void {
    if (this.tableOptions.includeTablePK) {
      this.output += `primary key columns:${JSON.stringify(pks)}\n`;
    }
  }

  writeForeignKeys(fks: ForeignKey[]): void {
    if (this.tableOptions.includeTableFKs) {
      this.output += "Foreign Keys:\n";
      for (const fk of fks) {
        this.output += `  fk columns ${fk['constrained_columns']} references columns ${fk['referred_columns']} in table ${fk['referred_table']}\n`;
      }
    }
  }

  writeColumnsStart(): void {
    if (this.columnOptions) {
      this.output += "Columns:\n";
    }
  }

  writeColumn(column: SchemaColumn): void {
    let shouldShow = this.columnOptions !== undefined;
    shouldShow = shouldShow && !(this.columnOptions?.includeOnlyFactColumns && (column.is_pk || column.is_fk));
    shouldShow = shouldShow && (!this.columnOptions?.columnsToInclude || this.columnOptions.columnsToInclude(this.curr_table!, column));

    if (this.columnOptions && shouldShow) {
      let columnType = column.type;
      this.output += `${column.name}:${columnType}`;

      if (this.columnOptions.includeColumnFriendlyName && column.friendlyName) {
        this.output += `(known as\`${column.friendlyName}\`)`;
      }
      if (this.columnOptions.includeColumnPKInfo) {
        this.output += `,isPrimaryKey=${column.is_pk}`;
      }
      if (this.columnOptions.includeColumnFKInfo) {
        this.output += `,isForeignKey=${column.is_fk}`;
      }
      if (this.columnOptions.includeColumnDescriptions && column.description) {
        this.output += `,description:\`${column.description}\``;
      }
      this.output += "\n";
    }
  }

  writeColumnsEnd(): void {
  }

  writeTableStart(): void {
  }

  writeTableEnd(): void {
    this.curr_table = null;
    this.output += "\n";
  }

  buildAndClear(): string {
    const ret = this.output;
    this.output = "";
    return ret;
  }
}

export interface ColumnType {
  name: string;
  type: string;
  nullable: boolean;
  is_pk?: boolean;
  is_fk?: boolean;
  friendlyName?: string;
  description?: string;
}

export const serializeColumnType = (indent: string, column: ColumnType) => {
  let output = indent + `${column.name} ${column.type}${column.nullable?" NOT NULL":""}, --`;

  if (column.friendlyName) {
    output += ` (known as\`${column.friendlyName}\`)`;
  }
  if (column.description != null) {
    output += ` ${column.description}`;
  }
  output += "\n";
  return output
}

export interface TableType {
  name: string,
  type?: string
  numRows: number,
  description?: string
  primaryKeys?: string[]
  foreignKeys?: ForeignKey[]
  columns?: ColumnType[]
}

export const serializeTableType = (table: TableType, allTableNames: Set<string>) => {
  let output = `CREATE TABLE ${table.name} (\n`

  let description = ""
  if (table.description) {
    description = "-- " + table.description + "\n"
    description = `-- There are ${table.numRows} rows in this table`
  }
  if (table.type) {
    description += `-- The ${table.name} table is a ${table.type} table.\n`
  }
  if (description.length) {
    output = description + output
  }

  if (table.columns) {
    for (const c of table.columns) {
      output += serializeColumnType("    ", c)
    }
  }

  if (table.primaryKeys) {
    output += `    PRIMARY KEY (${table.primaryKeys.join(",")})\n`;
  }

  if (table.foreignKeys) {
    for (const fk of table.foreignKeys) {
      if (allTableNames.has(fk.referred_table)) {
        output += `   FOREIGN KEY (${fk.constrained_columns.join(",")}) REFERENCES ${fk.referred_table}(${fk.referred_columns.join(",")})\n`;
      }
    }
  }
  output += `\n`

  return output
}

export const serializeTables = (tables: TableType[]) => {
  let output = ""
  const allTableNames = new Set(tables.map(t => t.name))
  for (const table of tables) {
    output += serializeTableType(table, allTableNames)
  }
  return output
}

export class ObjectOutputWriter extends OutputWriter<TableType[]> {
  output: TableType[] = [];
  currTable?: TableType

  writeTableStart(): void {
  }

  writeTableEnd(): void {
    if (this.currTable) this.output.push(this.currTable)
  }

  writeTableName(name: string, table_type: string, numRows: number, description?: string): void {
    this.currTable = {name: name, numRows: numRows}
    if (this.tableOptions.includeTableType) {
      this.currTable.type = table_type
    }
    if (this.tableOptions.includeDescription && description) {
      this.currTable.description = description
    }
  }

  writePrimaryKeys(pks: string[]): void {
    if (this.tableOptions.includeTablePK) {
      this.currTable!.primaryKeys = pks
    }
  }

  writeForeignKeys(fks: ForeignKey[]): void {
    if (this.tableOptions.includeTableFKs) {
      this.currTable!.foreignKeys = fks
    }
  }

  writeColumnsStart(): void {
  }

  writeColumn(column: SchemaColumn): void {
    let shouldShow = this.columnOptions !== undefined;
    shouldShow = shouldShow && !(this.columnOptions?.includeOnlyFactColumns && (column.is_pk || column.is_fk));
    shouldShow = shouldShow && (!this.columnOptions?.columnsToInclude || this.columnOptions.columnsToInclude(this.currTable!.name, column));

    if (this.columnOptions && shouldShow) {
      let addedCol: ColumnType = {
        name: column.name,
        type: column.type,
        nullable: column.nullable
      }
      if (this.columnOptions.includeColumnFriendlyName && column.friendlyName) {
        addedCol.friendlyName = column.friendlyName
      }
      if (this.columnOptions.includeColumnPKInfo) {
        addedCol.is_pk = column.is_pk
      }
      if (this.columnOptions.includeColumnFKInfo) {
        addedCol.is_fk = column.is_fk
      }
      if (this.columnOptions.includeColumnDescriptions && column.description) {
        addedCol.description = column.description
      }
      if (!this.currTable!.columns) this.currTable!.columns = []
      this.currTable!.columns.push(addedCol)
    }
  }

  writeColumnsEnd(): void {
  }

  buildAndClear(): TableType[] {
    const ret = this.output;
    this.output = [];
    return ret;
  }
}

export class TableOptions {
  includeTableType: boolean = true;
  includeDescription: boolean = false;
  includeTablePK: boolean = false;
  includeTableFKs: boolean = false;
}

export class ColumnOptions {
  columnsToInclude?: ((table: string, column: SchemaColumn) => boolean) | null = null;
  includeOnlyFactColumns: boolean = false;
  includeColumnDescriptions: boolean = false;
  includeColumnPKInfo: boolean = false;
  includeColumnFKInfo: boolean = false;
  includeColumnFriendlyName: boolean = false;
}
