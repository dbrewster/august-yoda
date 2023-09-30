import {Chain} from "@/util/llm/Chain";
import {ToolItem} from "@/util/llm/Agent";
import {z, ZodObject, ZodType} from "zod";

export class ExecuteDatabaseQueryTool extends Chain implements ToolItem {
  inputSchema: ZodType<ZodObject<any>> = z.object({
      query: z.string().describe("the question the user is asking")
    }) as any;
}
