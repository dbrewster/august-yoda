import {AgentOptions, BuiltinAgent} from "@/kamparas/Agent";
import {askQuestion, RabbitAgentEnvironment} from "@/kamparas/internal/RabbitAgentEnvironment";
import {nanoid} from "nanoid";
import {getOrCreateSchemaManager} from "@/kamparas/SchemaManager";
import {z, ZodSchema} from "zod";
import {EnvironmentHandler} from "@/kamparas/Environment";

describe("builtin agent", () => {
    test("communication", async () => {
        const builtin = makeBuiltinAgent("Adder3", "Adds to numbers", z.object({a: z.number(), b: z.number()}), z.object({x: z.number()}), add)
        const result = await askQuestion("Adder3", {a: 10, b: 30})
        expect(result).toStrictEqual({x: 40})
    })
})

interface InputArgs {
    a: number
    b: number
}

interface OutputArgs {
    x: number
}
const add = (input: InputArgs): OutputArgs => {
    console.log("adding", input)
    return ({x: input.a + input.b})
}

const makeBuiltinAgent = <T, U>(title: string, job_description: string, inputSchema: ZodSchema, outputSchema: ZodSchema, fn: (t:T) => U) => {
    const environment = new RabbitAgentEnvironment()
    const options = {
        title: title,
        job_description: job_description,
        availableTools: [],
        environment: environment,
        identifier: nanoid(),
        input_schema: getOrCreateSchemaManager().compileZod(inputSchema),
        answer_schema: getOrCreateSchemaManager().compileZod(outputSchema)
    } as AgentOptions
    return new BuiltinAgent(options, fn)
}
