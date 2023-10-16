import fs from "fs";
import process from "process";
import YAML from "yaml";
import {zodToJsonSchema} from "zod-to-json-schema";
import {z, ZodType} from "zod";

function regenSchema(_file_loc: string, _inputZod: ZodType, _outputZod: ZodType) {
    let smcPath = "src/praxeum/systemWorkers/" + _file_loc;
    let smcStart = fs.readFileSync(smcPath, 'utf8');
    const smc = YAML.parse(smcStart)
    smc.input_schema = zodToJsonSchema(_inputZod)
    smc.output_schema = zodToJsonSchema(_outputZod)
    let smcFinish = YAML.stringify(smc);
    fs.writeFileSync(smcPath, smcFinish)
}

regenSchema("MemoryReflector.yaml", z.object({
    events: z.string().describe("A list of events (with identifiers)"),
    number_of_insights: z.number().describe("The number of insights to generate")
}), z.object({
    insights: z.array(z.object({
        description: z.string().describe("A description of the insight"),
        importance: z.number().describe("The importance, from 0 to 1, of the insight"),
        events: z.array(z.string().describe("The id of an event")).describe("A list of events relevant to the insight")
    }))
}))

regenSchema("BuildMemory.yaml", z.object({
    agent_type: z.string(),
    agent_id: z.string(),
    conversation_id: z.string(),
}), z.object({
    thoughts: z.number(),
    observations: z.number(),
    help_and_response: z.number(),
    reflections: z.number(),
}))


process.exit()
