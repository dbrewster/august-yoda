import {AgentIdentifier, AgentOptions, AutonomousAgent, AutonomousAgentOptions, BuiltinAgent} from "@/kamparas/Agent";
import {askQuestion, RabbitAgentEnvironment} from "@/kamparas/internal/RabbitAgentEnvironment";
import {nanoid} from "nanoid";
import {getOrCreateSchemaManager} from "@/kamparas/SchemaManager";
import {z, ZodSchema} from "zod";
import {AgentEnvironment} from "@/kamparas/Environment";
import {LLM} from "@/kamparas/LLM";
import {AgentMemory} from "@/kamparas/Memory";
import {OpenAILLM} from "@/kamparas/internal/OpenAILLM";
import {MongoMemory} from "@/kamparas/internal/MongoMemory";

describe("builtin agent", () => {
    describe("single agent communication", ()=> {
        test("single agent communication", async () => {
            const builtin = makeBuiltinAgent("Adder", "Adds to numbers", z.object({a: z.number(), b: z.number()}), z.object({x: z.number()}), add)
            await builtin.initialize()
            const result = await askQuestion("Adder", {a: 10, b: 30})
            await builtin.shutdown()
            expect(result).toStrictEqual({x: 40})
        })
    })
    describe("two agent communication", ()=> {
        test("two agent communication", async () => {
            const adder = makeBuiltinAgent( "Adder", "Adds to numbers", z.object({a: z.number(), b: z.number()}), z.object({x: z.number()}), add)
            const multiplier = makeBuiltinAgent("Multiplier", "Multiplies to numbers", z.object({a: z.number(), b: z.number()}), z.object({x: z.number()}), multiply)
            await adder.initialize()
            await multiplier.initialize()

            const addResult = await askQuestion("Adder", {a: 10, b: 30})
            await adder.shutdown()
            expect(addResult).toStrictEqual({x: 40})

            const multiplyResult = await askQuestion("Multiplier", {a: 10, b: 30})
            await multiplier.shutdown()
            expect(multiplyResult).toStrictEqual({x: 300})
        })
    })
    describe("two base + 1 autonomous agent communication", ()=> {
        test("communication", async () => {
            const mathsPlan = `You are a helpful agent designed to do math operations. First break down the math problem down into a tree of operations, then use the tools available to solve each operation, finally return the final answer`
            const mathsInstructions = `Return the answer to the following math problem:
{problem}
Plan out how you are going to answer the question on each step.
Think about how each tool will help in answering the question. Be specific in your thought process and write your results in the content section of the response. Make sure you include your thoughts when calling a tool.
You must use the tools available to you to process the answer`
            const adder = makeBuiltinAgent("Adder", "Adds to numbers", z.object({a: z.number(), b: z.number()}), z.object({x: z.number()}), add)
            const multiplier = makeBuiltinAgent("Multiplier", "Multiplies to numbers", z.object({a: z.number(), b: z.number()}), z.object({x: z.number()}), multiply)
            const maths = await makeAutonomousAgent("Maths", "Does math using add and multiply",
                z.object({problem: z.string()}), z.object({x: z.string()}),
                mathsPlan, mathsInstructions, [adder.agent_identifier, multiplier.agent_identifier])
            await adder.initialize()
            await multiplier.initialize()
            await maths.initialize()
            const answer = await askQuestion("Maths", {problem: "What is 2 + 2?"})
            console.log(answer)
            await adder.shutdown()
            await multiplier.shutdown()
            await maths.shutdown()
        }, 60000)
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

const multiply = (input: InputArgs): OutputArgs => {
    console.log("adding", input)
    return ({x: input.a * input.b})
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

const makeAutonomousAgent = async (title: string, job_description: string, inputSchema: ZodSchema, outputSchema: ZodSchema,
                                   plan: string, planInstructions: string, availableTools: AgentIdentifier[]) => {
    const agentIdentifier = {
        title: title,
        job_description: job_description,
        identifier: nanoid(),
        input_schema: getOrCreateSchemaManager().compileZod(inputSchema),
        answer_schema: getOrCreateSchemaManager().compileZod(outputSchema),
    } as AgentIdentifier
    const environment = new RabbitAgentEnvironment()
    const llm = new OpenAILLM({})
    const memory = new MongoMemory(agentIdentifier)
    const options = {
        ...agentIdentifier,
        availableTools: availableTools,
        environment: environment,
        llm,
        memory,
        maxConcurrentThoughts: 5,
        model: "gpt-3.5-turbo",
        temperature: 0.2
    } as AutonomousAgentOptions
    await memory.recordPlan(plan)
    await memory.recordPlanInstructions(planInstructions)
    return new AutonomousAgent(options)
}
