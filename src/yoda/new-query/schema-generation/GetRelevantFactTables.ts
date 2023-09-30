import {BaseGetTables} from "@/yoda/new-query/schema-generation/BaseGetTables";

export interface VettedTable {
  data_product: string
  isFactTable: boolean
  table: string
}

export class GetRelevantFactTables extends BaseGetTables {
  readonly name: string = "get_fact_tables"
  readonly description: string = "Returns the relevant fact tables that match the query"

  isFactTables(): boolean {
    return true;
  }
}
