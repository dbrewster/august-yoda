import {BaseCallContext, BaseItem, ItemValues, RunManger} from "@/util/llm/BaseItem";
import {ToolItem} from "@/util/llm/Agent";
import {z, ZodType} from "zod";

export class ExecuteSQL extends BaseItem implements ToolItem {
  readonly name: string = "exec_sql"
  readonly description: string = "Use this tool to execute a query given a SQL statement."
  inputSchema: ZodType = z.object({
    schema: z.string().describe("The schema to be used to generate the SQL"),
    data_products: z.array(z.string().describe("The data products fetched from the tool gen_schema"))
  })

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
      runManager?.handleEvent(runId, "onAfterExecuteSQL", {data: data, e})
      console.error("Got error running query = ",e.parent.toString())
      throw e.parent.toString()
    }
    runManager?.handleEvent(runId, "onAfterExecuteSQL", {data: data})
    return {"data": data}
  }
}
