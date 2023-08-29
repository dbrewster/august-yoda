import process from "process";
import {QueryTypes, Sequelize} from "sequelize";

export class SQLDatabase {
  private _db: Sequelize;
  readonly dialect: string

  constructor() {
    this._db = new Sequelize(process.env.SQL_DATABASE as string)
    this.dialect = this._db.getDialect()
  }

  async executeSQL(sql: string) {
    return await this._db.query(sql, {type: QueryTypes.SELECT})
  }
}
