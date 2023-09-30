import * as console from "console";

import {parseQuery} from "./overload"
import {oClass, oProperty, SQLContext} from "@/obiwan/query/QueryClass";
import {getOrBuildConceptClasses} from "@/obiwan/query/BuildConceptClasses";
import dotenv from "dotenv";
import {SQLDatabase} from "@/util/SQLDatabase";

type BinaryOperand = ("+" | "-" | "*" | "/" | "&&" | "||" | "==" | "!=" | "<" | "<=" | ">" | ">=" | "in" | "%")
type UnaryOperand = ("!")

type BinaryOperator = [any, BinaryOperand, any]
type UnaryOperator = [UnaryOperand, any]

class oQuery<T extends typeof oClass> {
  t: InstanceType<T>
  whereClauses: (BinaryOperator | UnaryOperator | undefined) = undefined
  projection?: any = undefined
  limitRows?: number = undefined

  sqlContext: SQLContext = new SQLContext()

  constructor(t: T) {
    this.t = this.sqlContext.getOrCreateLinkDelegate("Query", "query", t)
    if (!this.t) {
      throw Error("Could not create type " + t)
    }
    this.t.getAlias()
  }

  where(fn: (o: InstanceType<T>) => (BinaryOperator | UnaryOperator)): oQuery<T> {
    let result = fn(this.t);
    if (this.whereClauses) {
      this.whereClauses = [this.whereClauses, "&&", result]
    } else {
      this.whereClauses = result
    }
    return this
  }

  return(fn: (o: InstanceType<T>) => Record<string, oProperty>): oQuery<T> {
    this.projection = fn.apply(this.t, [this.t])
    return this
  }

  limit(numRows: number) {
    this.limitRows = numRows
    return this
  }

  opToSQL(op: string) {
    switch (op) {
      case "==":
        return "="
      case "&&":
        return "AND"
      case "||":
        return "OR"
      case "!":
        return "NOT"
      default:
        return op
    }
  }

  printOperator(op: (BinaryOperator | UnaryOperator | any)): string {
    if (!op) {
      return "null"
    }
    if (op.length == 3) {
      return `${this.printOperator(op[0])} ${this.opToSQL(op[1])} ${this.printOperator(op[2])}`
    } else if (op.length == 2) {
      return `${this.opToSQL(op[0])} ${this.printOperator(op[1])}`
    } else if (op instanceof oProperty) {
      return op.toSQL()
    } else if (typeof op === "string") {
      return `'${op}'`
    } else {
      return op.toString()
    }
  }

  private async getTableOrSubSelect(table: oClass) {
    if (table.__tableName) return table.__tableName
    // else it is a sub select
    // todo -- handle union sub selects
    const baseType = table.__baseConcepts[0]
    const allTypes = await getOrBuildConceptClasses()
    let query = `Query(${baseType})\n`
    // todo -- handle constraints
    query += ".return((o) => ({\n"
    for (const accessedProperty of table.__accessedProperties) {
      const property: oProperty = table[accessedProperty] as oProperty
      if (property._expression && property._expression.length > 0) {
        query += `"${property._name}":${property._expression},\n`
      } else {
        query += `"${property._name}":${property._name},\n`
      }
    }
    query += "}))\n"
    console.log("generating subselect for ", query)
    const sql = await getSQLForQuery(query)
    console.log("generating subselect for ", sql)
    return (`(${sql})`)
  }

  async toSQL() {
    if (!this.projection) {
      throw Error("Projection must not be null")
    }
    console.log(this.projection)
    let projectSQL: string
    if (Array.isArray(this.projection)) {
      projectSQL = (this.projection as oProperty[]).map(prop => prop.toSQL()).join(",")
    } else {
      projectSQL = Object.keys(this.projection).map(key => `${this.projection![key].toSQL()} AS "${key}"`).join(",")
    }

    let sql =
      `SELECT ${projectSQL}
       FROM ${await this.getTableOrSubSelect(this.t)} ${this.t.getAlias()}
      `
    if (this.sqlContext.fks) {
      for (const fk of Object.values(this.sqlContext.fks)) {
        let table = this.sqlContext.getTable(fk.target);
        const tableOrSubSelect = await this.getTableOrSubSelect(table)
        const joins = fk.sourceProperties.map((sp, i) => {
          return `${fk.source}.${sp} = ${fk.target}.${fk.targetProperties[i]}`
        }).join(" AND ")
        sql += `    JOIN ${tableOrSubSelect} ${fk.target} ON ${joins}\n`
      }
    }

    if (this.whereClauses) {
      sql += `    WHERE ${this.printOperator(this.whereClauses)}\n`
    }
    return sql
  }
}

export const Query = <T extends typeof oClass>(clazz: T) => {
  return new oQuery<T>(clazz)
}

export const getSQLForQuery = async (query: string) => {
  const conceptClasses = await getOrBuildConceptClasses()
  return parseQuery(query, [], conceptClasses)().toSQL() as string
}

export const executeQuery = async (query: string) => {
  const sql = await getSQLForQuery(query)
  return await new SQLDatabase().executeSQL(sql)
}

// todo -- write methods to convert nodes to classes and edges to linkProperties on those nodes
//
// dotenv.config()
// const query = `Query(Opportunity)
//     .where((o) => o.stage == "Closed Won" && o.close_probability == 100)
//     .return((o) => [o.name])
// `
// const result = await executeQuery(query)
// console.log(result)
