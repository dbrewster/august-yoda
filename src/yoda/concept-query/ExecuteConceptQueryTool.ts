import {Chain} from "@/util/llm/Chain";
import {ToolItem} from "@/util/llm/Agent";
import {z, ZodObject, ZodType} from "zod";

export class ExecuteConceptQueryTool extends Chain implements ToolItem {
  inputSchema: ZodType<ZodObject<any>> = z.object({
      query: z.string().describe("the full question the user asked. All parts of the question are needed.")
    }) as any;
}
