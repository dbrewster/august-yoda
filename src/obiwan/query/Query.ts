import {parseQuery} from "./overload"
import {LinkProperty, oClass, oProperty, SQLContext} from "@/obiwan/query/QueryClass";
import {getOrBuildConceptClasses, Namespace} from "@/obiwan/code-gen/BuildConceptClasses";
import {SQLDatabase} from "@/util/SQLDatabase";

type BinaryOperand = ("+" | "-" | "*" | "/" | "&&" | "||" | "==" | "!=" | "<" | "<=" | ">" | ">=" | "in" | "%")
type UnaryOperand = ("!")

type BinaryOperator = [any, BinaryOperand, any]
type UnaryOperator = [UnaryOperand, any]

type PropertyOrClass = (oProperty | oClass)

class oQuery<T extends typeof oClass> {
  t: InstanceType<T>
  whereClauses: (BinaryOperator | UnaryOperator | undefined) = undefined
  groupByClause?: (PropertyOrClass | PropertyOrClass[]) = undefined;
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

  return(fn: (o: InstanceType<T>) => (oProperty[] | Record<string, oProperty>)): oQuery<T> {
    this.projection = fn(this.t)
    return this
  }

  groupBy(fn: (o: InstanceType<T>) => oProperty[]): oQuery<T> {
    this.groupByClause = fn(this.t)
    return this
  }

  limit(numRows: number) {
    this.limitRows = numRows
    return this
  }

  opToSQL(errors: string[], op: string) {
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

  printOperator(errors: string[], op: (BinaryOperator | UnaryOperator | any)): string {
    if (op == null) {
      errors.push("Invalid identifier " + op)
      return "null"
    }
    if (op.length == 3) {
      return `${this.printOperator(errors, op[0])} ${this.opToSQL(errors, op[1])} ${this.printOperator(errors, op[2])}`
    } else if (op.length == 2) {
      return `${this.opToSQL(errors, op[0])} ${this.printOperator(errors, op[1])}`
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
    const allTypes = await getOrBuildConceptClasses(table.__namespace)
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
    const sql = await getSQLForQuery(table.__namespace, query)
    return (`(${sql})`)
  }

  async toSQL() {
    const errors: string[] = []

    let fromStatement = `    FROM ${await this.getTableOrSubSelect(this.t)} ${this.t.getAlias()}`
    if (this.sqlContext.fks) {
      for (const fk of Object.values(this.sqlContext.fks)) {
        let table = this.sqlContext.getTable(fk.target);
        const tableOrSubSelect = await this.getTableOrSubSelect(table)
        const joins = fk.sourceProperties.map((sp, i) => {
          return `${fk.source}.${sp} = ${fk.target}.${fk.targetProperties[i]}`
        }).join(" AND ")
        fromStatement += `    JOIN ${tableOrSubSelect} ${fk.target} ON ${joins}\n`
      }
    }

    let whereStatement = ""
    if (this.whereClauses) {
      whereStatement = `    WHERE ${this.printOperator(errors, this.whereClauses)}\n`
    }

    let groupByColumns = new Set<string>()
    let groupByStatement = ""
    if (this.groupByClause) {
      let transformedGbClause: PropertyOrClass[]
      if (!Array.isArray(this.groupByClause)) {
        transformedGbClause = [this.groupByClause]
      } else {
        transformedGbClause = this.groupByClause
      }

      groupByColumns = new Set(transformedGbClause.map(prop => `${prop._parent.__alias}.${prop._name}`))
      groupByStatement = `    GROUP BY ${transformedGbClause.map(prop => {
        if (prop instanceof oClass) {
          return prop._sourceProperties.map((sp: string) => `${prop._parent.__alias}.${sp}`)
        } else {
          return [prop.toSQL()]
        }
      }).flat().join(",")}`
    }

    if (!this.projection) {
      throw Error("Projection must not be null")
    }
    let projectedColumns: Record<string, ProjectedColumn> = {}
    if (Array.isArray(this.projection)) {
      (this.projection as oProperty[]).forEach(prop => {
        const props: oProperty[] = [prop]
        let sql: string
        if (prop instanceof LinkProperty) {
          sql = prop._sourceProperties.map(p => `${prop._parent.__alias}.${p}`).join(",")
        } else {
          const prettyName = prop.makeProjectionName()
          sql = `${prop.toSQL()} AS "${prettyName}"`
        }
        const fullName = `${prop._parent.__alias}.${prop._name}`
        projectedColumns[fullName] = {
          parent: prop._parent.__alias!,
          name: prop._name,
          sql: sql,
          isAgg: prop.isAgg(),
        }
      })
    } else {
      Object.keys(this.projection).forEach(key => {
        const prop = this.projection![key]
        const fullName = `${prop._parent.__alias}.${prop._name}`
        projectedColumns[fullName] = {
          parent: prop._parent.__alias!,
          name: prop._name,
          sql: `${prop.toSQL()} AS "${key}"`,
          isAgg: prop.isAgg(),
        }
      })
    }
    const projectSQL = Object.values(projectedColumns).map(v => v.sql).join(",")
    errors.push(...this.validateColumns(groupByColumns, projectedColumns, "return"))

    let orderByStatement = ""

    let limitStatement = ""
    if (this.limitRows) {
      limitStatement = `LIMIT ${this.limitRows}`
    }

    if (errors.length) {
      throw new Error(errors.join("\n"))
    }

    return `SELECT ${projectSQL}
 ${fromStatement}
 ${whereStatement}
 ${groupByStatement}
 ${orderByStatement}
 ${limitStatement}
`.replace(/(\n{2,})/g, '\n')
  }

  validateColumns(groupByColumns: Set<string>, columns: Record<string, ProjectedColumn>, location: string): string[] {
    const errors: string[] = []
    if (groupByColumns.size > 0) {
      for (const column in columns) {
        const value = columns[column]
        if (!groupByColumns.has(column) && !value.isAgg) {
          errors.push(`${location} column ${column} must be an aggregate because it does not appear in the group by clause`)
        }
      }
    }
    return errors
  }
}

interface ProjectedColumn {
  parent: string,
  name: string,
  isAgg: boolean,
  sql: string
}

export const Query = <T extends typeof oClass>(clazz: T) => {
  return new oQuery<T>(clazz)
}

export const getSQLForQuery = async (namespace: Namespace, query: string) => {
  const conceptClasses = await getOrBuildConceptClasses(namespace)
  return parseQuery(query, [], conceptClasses)().toSQL() as string
}

export const executeQuery = async (namespace: Namespace, query: string) => {
  const sql = await getSQLForQuery(namespace, query)
  return await new SQLDatabase().executeSQL(sql)
}

export const getSampleRows = async (namespace: Namespace, concept: string, limit: number) => {
  return executeQuery(namespace, `Query(${concept})
  .return((o) => o.allProperties())
  .limit(${limit})`)
}

// dotenv.config()
// const results = await getSampleRows("Opportunity", 5)
// console.log(results)

// const query = `Query(Opportunity)
//     .where((o) => o.probability > 0)
//     .groupBy((o) => [o.stage_name, o.close_date.month.asText()])
//     .return((o) => [o.stage_name, o.close_date.month.asText(), o.amount.count(), o.amount.sum()])
// `

// const query = `Query(OpportunityLineItem).where(o => [
//   o.opportunity.is_closed,
//   '&&',
//   [
//     o.product2.name,
//     '==',
//     'Mega laptop'
//   ]
// ]).return(o => [o.opportunity.account.name])
// `
// const query = `Query(OpportunityLineItem).where(o => [
//   o.opportunity.is_closed,
//   '&&',
//   [
//     o.product2.name,
//     '==',
//     'Mega laptop'
//   ]
// ]).groupBy(o => o.opportunity.account.name).return(o => [
//   o.opportunity.account.name,
//   o.opportunity.account.count()
// ])
// `
// const result = await executeQuery(query)
// console.log(result)
//
