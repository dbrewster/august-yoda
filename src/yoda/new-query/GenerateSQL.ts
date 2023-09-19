import {BaseCallContext, BaseLLMItem, BaseOptions, ItemValues} from "@/yoda/new-query/BaseItem.js";
import {HumanMessagePromptTemplate, SystemMessagePromptTemplate} from "langchain/prompts";
import {z, ZodType} from "zod";
import {mongoCollection} from "@/yoda/api/util.js";
import {ChatOpenAI} from "langchain/chat_models/openai";
import {ToolItem} from "@/yoda/new-query/Agent.js";

const getDBOptions = (dialect: string) => {
  let dialectStr: string = "SQL"
  let extraInstructions: string = ""
  switch (dialect) {
    case "postgres":
      dialectStr = "PostgreSQL"
      extraInstructions = `Wrap each column name in double quotes (") to denote them as delimited identifiers.`
      break;
    case "sqlite":
      dialectStr = "SQLite"
      extraInstructions = `Wrap each column name in double quotes (") to denote them as delimited identifiers.`
      break;
    case "snowflake":
      dialectStr = "snowflake SQL"
      extraInstructions = `Wrap each column name in double quotes (") to denote them as delimited identifiers.`
      break;
    case "mysql":
      dialectStr = "MySQL"
      extraInstructions = `Wrap each column name in backticks (\`) to denote them as delimited identifiers.`
      break;
    case "mssql":
      dialectStr = "MS SQL"
      extraInstructions = `Wrap each column name in square brackets ([]) to denote them as delimited identifiers.`
      break;
    case "sap":
      dialectStr = "SAP HANA"
      extraInstructions = `Wrap each column name in double quotes (") to denote them as delimited identifiers.`
      break;
    default:
  }
  return [dialectStr, extraInstructions]
}

interface GenerateSQLProps extends BaseOptions {
  top_k?: number // defaults to 250
}

export class GenerateSQL extends BaseLLMItem<GenerateSQLProps> implements ToolItem {
  readonly name: string = "gen_sql"
  readonly description: string = "Generates SQL for the query and the schema"
  inputSchema: ZodType = z.object({
    data_products: z.string().describe("The data products"),
    system_facts: z.string().describe("The system facts"),
    dp_facts: z.string().describe("The data product facts"),
    schema: z.string().describe("The SQL to execute against the database")
  })

  readonly humanMessages: HumanMessagePromptTemplate[] = [HumanMessagePromptTemplate.fromTemplate(
    `You are a {db_dialect} expert. Given an input question, first create a syntactically correct PostgreSQL query to run, then look at the results of the query and return the answer to the input question.
Unless the user specifies in the question a specific number of examples to obtain, query for at most {top_k} results using the LIMIT clause as per PostgreSQL. You can order the results to return the most informative data in the database.
Never query for all columns from a table. You must query only the columns that are needed to answer the question. {extra_db_instructions}
Pay attention to use only the column names you can see in the tables below. Be careful to not query for columns that do not exist. Also, pay attention to which column is in which table.
You can order the results by a relevant column to return the most interesting examples in the database.
Double check that you are using the correct columns names from the correct tables. NEVER abbreviate column names and always match them to the schema.

You are generating a SQL statement for the following query:
 %%%{query}%%%

Make sure you use the following facts about the tables:
{system_facts}
{dp_facts}

Use every fact. The facts are not ordered. The facts may reference objects that are actually tables or columns in the database. Do your best to map the concepts in the facts to tables or columns.

Return a the reason you generated the query, include the following in your reasoning:
  * What was the primary table for the select statement and why it was chosen.
  * What facts were used to generate the query?
  * Are the tables and columns you chose in the given schema?
  * Under what conditions would you join the driving tables together v/s union them in separate queries?

Finally return a single SQL statement that answers the question

{previous_err}
`)];
  readonly systemMessages: SystemMessagePromptTemplate[] = [SystemMessagePromptTemplate.fromTemplate(
    `The schema for the tables in the database are:

{schema}
`)];
  readonly llmOutputSchema: ZodType = z.object({
    sql: z.string().describe("the generated user query"),
    reason: z.string().describe("the reason this sql statement was chosen")
  })

  modelToUse(options: BaseCallContext): ChatOpenAI {
    return options.model4
  }

  async beforeLLM(input: ItemValues, callOptions: BaseCallContext): Promise<ItemValues> {
    const topK = this.props.top_k || 250
    const [dialectStr, extraInstructions] = getDBOptions(callOptions.db.dialect)
    const dataProducts = input.data_products as string[]

    let prevErr = ""
    if (input.previous_error) {
      prevErr = `A previous SQL execution threw the following error:\n${input.previous.error}\n`
    }
    return {top_k: topK, db_dialect: dialectStr, extra_db_instructions: extraInstructions, ...input, previous_err: prevErr};
  }

  async afterLLM(input: ItemValues): Promise<ItemValues> {
    return {sql: input.sql, reason: input.reason}
  }
}
