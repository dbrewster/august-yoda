import process from "process";
import {QueryTypes, Sequelize} from "sequelize";
import {mongoCollection} from "@/util/util";

export class SQLDatabase {
  private _db: Sequelize;
  readonly dialect: string

  constructor() {
    this._db = new Sequelize(process.env.SQL_DATABASE as string, {logging:false})
    this.dialect = this._db.getDialect()
  }

  async executeSQL(sql: string) {
    return await this._db.query(sql, {type: QueryTypes.SELECT}).then(rows => rows.map(r => r as Record<string, any>))
  }

  async getRows(tableName: string, numRows: number, columnNames?: string[]) {
    let localColumnNames = columnNames
    if (!localColumnNames) {
      const collection = await mongoCollection("schema")
      const table = await collection.findOne({name: tableName}, {projection: {columns: 1}})
      if (!table) {
        return null
      }
      localColumnNames = (table.columns as Record<string, any> []).map(c => c.name)
    }
    const sql = `select ${localColumnNames.join(",")} from "${tableName}" limit ${numRows}`
    console.log("executing sql", sql)
    return this.executeSQL(sql)
  }
}
