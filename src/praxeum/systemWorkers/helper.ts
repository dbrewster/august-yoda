import fs from "fs";
import process from "process";
import YAML from "yaml";
import {zodToJsonSchema} from "zod-to-json-schema";
import {z} from "zod";

let smcPath = "src/praxeum/systemWorkers/memory_reflector.yaml";
let smcStart = fs.readFileSync(smcPath, 'utf8');
const smc = YAML.parse(smcStart)
smc.input_schema = zodToJsonSchema(z.object({
    events: z.string().describe("A list of events (with identifiers)"),
    number_of_insights: z.number().describe("The number of insights to generate")
}))
smc.output_schema = zodToJsonSchema(z.object({
    insights: z.array(z.object({
        description: z.string().describe("A description of the insight"),
        importance: z.number().describe("The importance, from 0 to 1, of the insight"),
        events: z.array(z.string().describe("The id of an event")).describe("A list of events relevant to the insight")
    }))
}))
let smcFinish = YAML.stringify(smc);
fs.writeFileSync(smcPath, smcFinish)

process.exit()
