import {Chain} from "@/yoda/new-query/Chain.js";
import {ToolItem} from "@/yoda/new-query/Agent.js";
import {z, ZodObject, ZodType} from "zod";

export class ExecuteDatabaseQueryTool extends Chain implements ToolItem {
  inputSchema: ZodType<ZodObject<any>> = z.object({
      query: z.string().describe("the question the user is asking")
    }) as any;
}
