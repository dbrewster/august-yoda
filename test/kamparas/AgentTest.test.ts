import {AgentIdentifier, AgentOptions, AutonomousAgent, AutonomousAgentOptions, BuiltinAgent} from "@/kamparas/Agent";
import {RabbitAgentEnvironment} from "@/kamparas/internal/RabbitAgentEnvironment";
import {nanoid} from "nanoid";
import {getOrCreateSchemaManager} from "@/kamparas/SchemaManager";
import {z, ZodSchema} from "zod";
import {MongoMemory} from "@/kamparas/internal/MongoMemory";
import {RootQuestion} from "@/kamparas/RootQuestion";
import {shutdownRabbit} from "@/kamparas/internal/RabbitMQ";
import {shutdownMongo} from "@/util/util";
import {makeLLM} from "@/kamparas/internal/LLMRegistry";

describe("builtin agent", () => {
    beforeAll(async () => {
        await rootQuestion.start()
        adder.start()
        multiplier.start()
    })

    afterAll(async () => {
        await adder.shutdown()
        await multiplier.shutdown()
        await shutdownRabbit()
        await shutdownMongo()
    })

    describe("single agent communication", ()=> {
        test("single agent communication", async () => {
            const result = await rootQuestion.askQuestion(adder.title, {a: 10, b: 30})
            expect(result).toStrictEqual({x: 40})
        })
    })
    describe("two agent communication", ()=> {
        test("two agent communication", async () => {
            const addResult = await rootQuestion.askQuestion(adder.title, {a: 10, b: 30})
            const multiplyResult = await rootQuestion.askQuestion(multiplier.title, {a: 10, b: 30})
            expect(multiplyResult).toStrictEqual({x: 300})
        })
    })
    describe("two base + 1 autonomous agent communication", ()=> {
        beforeAll(() => {
            maths.start()
        })

        afterAll(async () => {
            await maths.shutdown()
        })
        test("communication", async () => {
            const answer = await rootQuestion.askQuestion(maths.title, {problem: "What is 2 + 2?"})
            console.log(answer)
        }, 60000)
        test("multiple_calls", async () => {
            const answer1 = await rootQuestion.askQuestion(maths.title, {problem: "What is 2 + 2?"})
            const answer2 = await rootQuestion.askQuestion(maths.title, {problem: "What is 5 + 5?"})
            expect(answer1).not.toEqual(answer2)
        }, 60000)
        test("multi_tool_use", async () => {
            const answer = await rootQuestion.askQuestion(maths.title, {problem: "(2 + 2)*5"})
            console.log(answer)
        }, 90000)
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
    console.log("multiplying", input)
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
    const llm = makeLLM("openai.textFunctions",  "gpt-3.5-turbo", 0.2)
    const memory = new MongoMemory(agentIdentifier)
    const options = {
        ...agentIdentifier,
        availableTools: availableTools,
        environment: environment,
        llm,
        memory,
        initial_plan: plan,
        overwrite_plan: true,
        initial_plan_instructions: planInstructions,
        overwrite_plan_instructions: true,
        maxConcurrentThoughts: 5,
    } as AutonomousAgentOptions
    return new AutonomousAgent(options)
}

const rootQuestion = new RootQuestion(new RabbitAgentEnvironment())
const adder = makeBuiltinAgent( "Adder", "Adds two numbers", z.object({a: z.number(), b: z.number()}), z.object({x: z.number()}), add)
const multiplier = makeBuiltinAgent("Multiplier", "Multiplies to numbers", z.object({a: z.number(), b: z.number()}), z.object({x: z.number()}), multiply)
const mathsPlan = `You are a helpful agent designed answer user questions. Break the problem down into steps and use the tool available when needed.`
const maths = await makeAutonomousAgent("Maths", "Does math using add and multiply",
    z.object({problem: z.string()}), z.object({x: z.string()}),
    mathsPlan, `{problem}`, [adder.agent_identifier, multiplier.agent_identifier])
