// deno-lint-ignore-file no-explicit-any
import jsforce, {Connection, DescribeGlobalResult, UserInfo} from "jsforce";
import fs, {readFileSync} from "node:fs";
import * as foo from "extract-pg-schema"
import {Client, Configuration, SSLMode} from "ts-postgres";

const {extractSchemas} = foo

class TestMe {
  private conn: Connection;

  constructor() {
    this.conn = new jsforce.Connection({
      loginUrl: "https://augustdata-dev-ed.develop.my.salesforce.com/"
    });
  }

  getMD() {
    this.conn.login("dave@augustdata.ai", "AAc48P2fyY5wXf5" + "c2dqGjieWuUuJW8vSPgrESKYo").then(async (result: UserInfo) => {
      console.log('Connected as ' + result.id);
      const objectNames = await this.conn.describeGlobal().then(
        (g: DescribeGlobalResult) => g.sobjects.filter(o => o.createable).map(o => o.name)
      ).catch((err: any) => {
        console.error('err', err);
        return [] as string[]
      })

      const accounts = await this.conn.sobject("Account").find().then(res => res)
      console.log(JSON.stringify(accounts, null, 1))
      // const descriptions = await Promise.all(objectNames.map(n => this.conn.describe(n)))
      // fs.writeFile("./sf.json", JSON.stringify(descriptions, null, 1), (err) => {
      //   if (err) console.error(err)
      // })
      // this.conn.metadata.describe("49.0").then(meta => {
      //   console.log("organizationNamespace: " + meta.organizationNamespace);
      //   console.log("partialSaveAllowed: " + meta.partialSaveAllowed);
      //   console.log("testRequired: " + meta.testRequired);
      //   console.log("metadataObjects count: " + meta.metadataObjects.map(md => JSON.stringify(md)).join("\n"));
      // }).catch(err => {
      //   return console.error('err', err);
      // })
    }).catch(err => {
      return console.error('err', err);
    })
  }

  makeFks() {
    const file = readFileSync("./sf.json").toString()
    const obj = JSON.parse(file) as Record<string, any>[]
    const smallObj = obj.map(o => {
      const childRels = (o.childRelationships as Record<string, any>[]).filter(cr => cr.deprecatedAndHidden === false).map(cr => ({
        field: cr.field,
        childSObject: cr.childSObject
      }))
      const fields = (o.fields as Record<string, any>[]).filter(o => o.soapType === "tns:ID" && o.referenceTo.length).map(o => ({
        name: o.name,
        referenceTo: o.referenceTo,
        nullable: o.nillable
      }))
      return ({name: o.name, fields: fields})
    })

    fs.writeFile("./sf.fk.json", JSON.stringify(smallObj, null, 1), (err) => console.error(err))
    // console.log(JSON.stringify(smallObj, null, 1))
  }

  async deleteTables() {
    const connectInfo = {
      host: '127.0.0.1',
      port: 5432,
      database: 'sf1',
      user: 'ext',
      password: 'pass123',
    }
    const result = await foo.default.extractSchemas(connectInfo).catch(err => console.log("error", err)) as Record<string, any>
    const dbTables = result.salesforce.tables as Record<string, any>[]
    const dbTableNames = dbTables.map(o => (o.name as string).toLowerCase().replaceAll("_", "")).sort()

    const file = readFileSync("src/sfdc/sf.fk.json").toString()
    const obj = JSON.parse(file) as Record<string, any>[]
    const sfObjectNames = obj.map(o => (o.name as string).toLowerCase().replaceAll("_", "")).sort()

    console.log("num db tables", dbTableNames.length)
    console.log("num sf tables", sfObjectNames.length)

    const missingFromDB = sfObjectNames.filter(n => dbTableNames.indexOf(n) < 0)
    const missingFromSF = dbTableNames.filter(n => sfObjectNames.indexOf(n) < 0)

    console.log("missing from SF", missingFromSF)
    console.log("missing from DB", missingFromDB)

    const objsInDB = missingFromSF.map(n => dbTables.find((o) => {
      return (o.name as string).toLowerCase().replaceAll("_", "") === n
    })!)

    try {
      const client = new Client({
          host: '127.0.0.1',
          port: 5432,
          database: 'sf1',
          user: 'ext',
          password: 'pass123',
          ssl: 'disable'
        }
      )
      await client.connect()
      await Promise.all(objsInDB.map(async objInDB => {
        console.log("dropping table", objInDB.name)
        await client.query(`drop table "salesforce"."${objInDB.name}" CASCADE`)
      }))
      client.end()
    } catch (e) {
      console.error(e)
    }
  }

  async main() {
    const client = new Client({
        host: '127.0.0.1',
        port: 5432,
        database: 'sf1',
        user: 'ext',
        password: 'pass123',
        ssl: 'disable'
      }
    )
    await client.connect()
    const fkConstraints = await this.getFKConstraints(client)
    const fksByName = {} as Record<string, FKConstraint>
    fkConstraints.forEach(fk => {
      fksByName[fk.constraint_name] = fk
    })

    const result = await foo.default.extractSchemas({
        host: '127.0.0.1',
        port: 5432,
        database: 'sf1',
        user: 'ext',
        password: 'pass123',
      }
    ).catch(err => console.log("error", err)) as Record<string, any>

    const shortNameToTableName = {} as Record<string, string>
    const dbTables = result.salesforce.tables as Record<string, any>[]
    dbTables.forEach(o => {
      const normName = (o.name as string).toLowerCase().replaceAll("_", "")
      // delete o.columns
      // console.log(o)
      shortNameToTableName[normName] = o.name
    })

    const file = readFileSync("src/sfdc/sf.fk.json").toString()
    const objs = JSON.parse(file) as Table[]
    objs.map(o => {
      const shortName = (o.name as string).toLowerCase().replaceAll("_", "")
      const tableName = shortNameToTableName[shortName]
      if (tableName) {
        o.fields.map(async f => {
          const constraintName = f.name;
          const columnName = f.name;
          if (f.referenceTo.length > 1) {
            for (const refTableName of f.referenceTo) {
              const referenceTable = shortNameToTableName[refTableName.toLowerCase().replaceAll("_", "")]
              if (referenceTable)
                await this.createFK(client, fksByName, constraintName + "_" + refTableName, tableName, columnName, referenceTable);
            }
          }
          if (f.referenceTo.length == 1) {
            const refTableName = f.referenceTo[0];
            const referenceTable = shortNameToTableName[refTableName.toLowerCase().replaceAll("_", "")]
            if (referenceTable)
              await this.createFK(client, fksByName, constraintName, tableName, columnName, referenceTable);
          }
        })
      }
    })

    // client.end()
  }

  private async createFK(client: Client, fksByName: Record<string, FKConstraint>, constraintName: string, tableName: string, columnName: string, referenceTable: string) {
    if (!Object.hasOwn(fksByName, constraintName)) {
      const sql = `alter table "salesforce"."${tableName}"
          ADD CONSTRAINT "${constraintName}" FOREIGN KEY ("${this.fixCamelCase(columnName)}") REFERENCES "salesforce"."${referenceTable}"`;
      await client.query(sql).then(r => {
        console.log('Altered table ', tableName)
        return r
      }).catch(e => {
        if (e.code == "42703") {
          console.error("Bad column in constraint", this.fixCamelCase(constraintName), tableName, columnName, referenceTable)
        } else if (e.code === "42P01") {
          console.error("Bad table name", `"salesforce"."${referenceTable}"`)
        } else {
          console.error("failed for table", tableName, constraintName, this.fixCamelCase(constraintName), columnName, referenceTable, e.code)
        }
      })
    }
  }

  async getFKConstraints(client: Client) {
    const sql = `SELECT conrelid::regclass::text AS table_name,
                        conname                  AS foreign_key,
                        pg_get_constraintdef(oid)
                 FROM pg_constraint
                 WHERE contype = 'f'
                   AND connamespace = 'salesforce'::regnamespace
                 ORDER BY conrelid::regclass::text, contype DESC;`

    const results = await client.query(sql)
    return results.rows.map(r => {
      const re = /FOREIGN KEY \((?<t_columns>[^)]*)\) REFERENCES (?<ref_table>[^)]+)\((?<fk_columns>[^)]*)\)/
      const matches = re[Symbol.match](r[2] as string)
      if (!matches) {
        console.error("re didn't match", r[2])
      }

      return {
        table_name: (r[0] as string).slice(11),
        constraint_name: r[1],
        columns: matches!.groups?.t_columns.split(",").map(s => s.trim()),
        ref_table: matches!.groups?.ref_table,
        ref_columns: matches!.groups?.fk_columns.split(",").map(s => s.trim())
      } as FKConstraint
    })
  }

  fixCamelCase(str: string) {
    let ret = ""
    const re = /^[A-Z]*$/
    let lastWasUnderscore = false
    for (let i = 0; i < str.length; i++) {
      const c = str.charAt(i)
      if (i == 0) {
        ret += c.toLowerCase()
      } else if (re.test(c)) {
        if (!lastWasUnderscore) {
          ret += "_"
        }
        ret += c.toLowerCase()
      } else if (c >= '0' && c <='9' && !lastWasUnderscore) {
        ret += "_" + c
      } else if (c == '_') {
        if (!lastWasUnderscore) {
          ret += c
        }
      } else {
        ret += c
      }

      lastWasUnderscore = c === "_"
    }
    return ret
  }
}

interface Field {
  name: string,
  referenceTo: string[],
  nullable: boolean
}

interface Table {
  name: string,
  fields: Field[]
}

interface FKConstraint {
  table_name: string,
  constraint_name: string,
  columns: string[],
  ref_table: string,
  ref_columns: string[]
}

const t = new TestMe()
await t.main()
