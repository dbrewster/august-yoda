import {BaseGetTables} from "@/yoda/new-query/schema-generation/BaseGetTables.js";

export class GetRelevantDimensionTables extends BaseGetTables {
  readonly name: string = "get_dim_tables"
  readonly description: string = "Returns the relevant dimension tables that match the query"

  isFactTables(): boolean {
    return false;
  }
}
