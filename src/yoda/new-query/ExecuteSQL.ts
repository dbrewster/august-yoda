import {BaseCallContext, BaseItem, ItemValues, RunManger} from "@/yoda/new-query/BaseItem.js";

export class ExecuteSQL extends BaseItem {
  readonly name: string = "exec_sql"
  readonly description: string = "Executes the given sql"

  async call(runId: string, input: ItemValues, options: BaseCallContext, runManager?: RunManger): Promise<ItemValues> {
    runManager?.handleEvent(runId, "onBeforeExecuteSQL", {sql: input.sql})
    let data: any
    try {
      data = await options.db.executeSQL(input.sql)
      // convert the data into columns and values
      let columns: string[] = []
      let values = [] as any[][]
      data.forEach((row: Record<string, any>) => {
        if (!columns.length) {
          columns = Object.keys(row)
        }
        values.push(Object.values(row))
      })
      data = {columns: columns, values: values}
    } catch (e: any) {
      console.error("Got error running query = ",e, e.parent.toString())
      data = e.parent.toString()
    }
    runManager?.handleEvent(runId, "onAfterExecuteSQL", {data: data})
    return {"data": data}
  }
}
