import {mongoCollection} from "@/util/util";
import {Collection, Document} from "mongodb";
import {SchemaTable} from "@/util/SchemaDefinitions";

export interface TableVertex {
  id: string,
  label: string,
  properties: TableProperty[]
}

export interface TableProperty {
  name: string
  type: string,
}

export interface TableEdge {
  id: string
  label: string
  source: string
  target: string
}

export class GraphBuilder {
  // Given a table, build a graph from that table
  private readonly _tableName: string;

  constructor(tableName: string) {
    this._tableName = tableName;
  }

  async buildGraph() {
    const collection = await mongoCollection("schema")
    const table = (await collection.findOne({name: this._tableName}))! as Record<string, any> as SchemaTable
    const nodes: Record<string, TableVertex> = {}
    const edges: TableEdge[] = []
    await this.buildNode(collection, table, nodes, edges)

    return [Object.values(nodes), edges]
  }

  async buildNode(collection: Collection<Document>, table: SchemaTable, nodes: Record<string, TableVertex>, edges: TableEdge[]) {
    let tableName = table.name.toLowerCase();
    nodes[tableName] = {
      id: tableName,
      label: table.name,
      properties: table.columns.filter(c => !(c.is_fk || c.is_pk)).map(c => ({
        name: c.name,
        type: c.type
      }) as TableProperty)
    }
    await Promise.all(table.foreign_keys.map(async fk => {
      const refT = (await collection.findOne({name: fk.referred_table}))! as Record<string, any> as SchemaTable
      if (refT.num_rows > 0) {
        let refTableName = fk.referred_table.toLowerCase();
        if (!Object.hasOwn(nodes, refTableName)) {
          await this.buildNode(collection, refT, nodes, edges)
        }
        const edgeId = `${tableName}.[${fk.constrained_columns.join(",")}]_${refTableName}.[${fk.referred_columns.join(",")}]`
        edges.push({id: edgeId, label: fk.name, source: tableName, target: refTableName})
      }
    }))
  }
}

//
// dotenv.config();
//
// const t = new GraphBuilder("opportunity")
// const [nodes, edges] = await t.buildGraph()
//
// console.log("nodes", JSON.stringify(nodes, null, 1))
// console.log("edges", JSON.stringify(edges, null, 1))
