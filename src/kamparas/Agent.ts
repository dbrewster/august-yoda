import {AgentMemory, EpisodicEvent} from "@/kamparas/Memory";
import {nanoid} from "nanoid";
import {
    AgentEnvironment,
    EnvironmentHandler,
    EventContent,
    HelpResponse,
    NewTaskInstruction
} from "@/kamparas/Environment";
import {HelperCall, LLM, LLMResult, ModelType} from "@/kamparas/LLM";
import {DateTime} from "luxon";
import {ValidateFunction} from "ajv";
import {getOrCreateSchemaManager} from "@/kamparas/SchemaManager";
import {z} from "zod";
import {Logger} from "winston"
import {rootLogger} from "@/util/RootLogger"
import {DirectMessage} from "@/kamparas/internal/RabbitAgentEnvironment";

export interface AgentTool {
    title: string
    job_description: string
    input_schema: ValidateFunction<object>
}

export interface AgentIdentifier {
    title: string
    job_description: string
    identifier: string
    input_schema: ValidateFunction<object>
    answer_schema: ValidateFunction<object>
}

export interface AgentOptions extends AgentIdentifier {
    environment: AgentEnvironment
}

export interface AutonomousAgentOptions extends AgentOptions {
    memory: AgentMemory
    llm: LLM
    maxConcurrentThoughts: number,
    model: ModelType,
    temperature?: number
    availableTools: AgentIdentifier[]
}

export abstract class Agent implements EnvironmentHandler {
    environment: AgentEnvironment;
    agent_identifier: AgentIdentifier
    logger: Logger;

    protected constructor(options: AgentOptions) {
        this.title = options.title
        this.logger = rootLogger.child({type: this.getLogType(), title: options.title, identifier: options.identifier})
        this.job_description = options.job_description
        this.inputSchema = options.input_schema
        this.outputSchema = options.answer_schema
        this.identifier = options.identifier
        this.environment = options.environment;
        this.environment.setLogger(rootLogger)
        this.agent_identifier = options
    }

    title: string;
    job_description: string;
    inputSchema: ValidateFunction<object>;
    outputSchema: ValidateFunction<object>;
    identifier: string;

    getLogType() {
        return "agent"
    }

    async initialize() {
        this.environment.setLogger(this.logger.child({subType: "environment"}))
        await this.environment.registerHandler(this)
    }

    async shutdown() {
        await this.environment.shutdown()
    }

    abstract processDirectMessage(response: DirectMessage): Promise<void>

    abstract processInstruction(instruction: NewTaskInstruction): Promise<void>

    processInstructionError(instruction: NewTaskInstruction, error: any): void {
        this.logger.error("Error processing Instruction:", error)
        const helpResponse: HelpResponse = {
            conversation_id: instruction.helpee_conversation_id,
            request_id: instruction.request_id,
            helper_title: this.title,
            helper_identifier: this.identifier,
            status: 'failure',
            response: {error: error instanceof Error ? error.toString() : error},
        }
        this.environment.answer(instruction.helpee_title, instruction.helpee_id, helpResponse, instruction.helpee_conversation_id)
    }

    processDecodeError(type: "direct" | "instruction", message: string): void {
        console.error(`Error decoding ${type} message: ${message}`)
    }

    processDirectMessageError(directMessage: DirectMessage, error: any): void {
        console.error(`Error executing direct message ${JSON.stringify(directMessage)} -- error: ${error}`)
    }

    id_string() {
        return `title:${this.title}, id:${this.identifier}`
    }
}

export class BuiltinAgent extends Agent {
    func: (args: any) => any

    constructor(options: AgentOptions, func: (args: any) => any) {
        super(options);
        this.func = func;
    }

    processDirectMessage(response: DirectMessage): Promise<void> {
        return Promise.resolve();
    }

    async processInstruction(instruction: NewTaskInstruction): Promise<void> {
        this.logger.info(`Received new request from ${instruction.helpee_title}:${instruction.helpee_id}`)
        let builtinFuncReturn: Record<string, any>
        if (this.func.constructor.name === "AsyncFunction") {
            builtinFuncReturn = await this.func(instruction.input as any)
        } else {
            builtinFuncReturn = this.func(instruction.input as any)
        }

        this.logger.info(`Answering question from ${instruction.helpee_title}:${instruction.helpee_id}`)
        return await this.environment.answer(instruction.helpee_title, instruction.helpee_id, {
            conversation_id: instruction.helpee_conversation_id,
            helper_identifier: this.identifier,
            helper_title: this.title,
            request_id: instruction.request_id,
            status: 'success',
            response: builtinFuncReturn as Record<string, any>
        }, instruction.helpee_conversation_id)
    }
}

export const final_answer_tool = {
    title: "final_answer",
    job_description: "return the final answer to the user.",
    input_schema: getOrCreateSchemaManager().compileZod(z.object({
        result: z.string().describe("The final answer")
    }))
} as AgentTool


type AgentToolCall = {
    tool_def: AgentTool
    call: (agent: AutonomousAgent, conversationId: string, requestId: string, help: HelperCall) => Promise<void>
}

const remoteAgentCall = (tool_def: AgentTool): AgentToolCall => ({
    tool_def: tool_def,
    call: async (agent: AutonomousAgent, conversationId: string, requestId: string, help: HelperCall): Promise<void> => {
        await agent.memory.recordEpisodicEvent({
            actor: "worker",
            type: "help",
            conversation_id: conversationId,
            timestamp: DateTime.now().toISO()!,
            content: {
                tool_name: help.title,
                arguments: help.content
            }
        })
        agent.logger.info(`Asking help from ${help.title}`, {conversation_id: conversationId})
        // noinspection ES6MissingAwait
        agent.environment.askForHelp(agent.title, agent.identifier, conversationId, help.title, requestId, help.content)
        return Promise.resolve()
    }
})

export const localAgentCall = (tool_def: AgentTool, fn: (conversationId: string, requestId: string, content: EventContent) => Promise<void>): AgentToolCall => ({
    tool_def: tool_def,
    call: (agent: AutonomousAgent, conversationId: string, requestId: string, help: HelperCall): Promise<void> => {
        return fn(conversationId, requestId, help.content)
    }
})

export class AutonomousAgent extends Agent {
    availableHelpers: Record<string, AgentToolCall> = {}
    memory: AgentMemory;
    llm: LLM
    maxConcurrentThoughts: number
    model: ModelType
    temperature?: number

    constructor(options: AutonomousAgentOptions) {
        super(options);
        options.availableTools.forEach(t => {
            this.availableHelpers[t.title] = remoteAgentCall(t)
        })

        const doAnswerThisPtr = this
        this.availableHelpers[final_answer_tool.title] = localAgentCall(final_answer_tool, this.doAnswer.bind(doAnswerThisPtr))

        this.memory = options.memory;
        this.llm = options.llm
        this.maxConcurrentThoughts = options.maxConcurrentThoughts
        this.model = options.model
        this.temperature = options.temperature
        this.memory.setLogger(rootLogger)
        this.llm.setLogger(rootLogger)
    }

    async initialize(): Promise<void> {
        await super.initialize();
        this.llm.setLogger(this.logger.child({subType: "llm"}))
        this.memory.setLogger(this.logger.child({subType: "memory"}))
    }

    async doAnswer(conversationId: string, requestId: string, content: EventContent) {
        const taskStart = (await this.memory.readEpisodicEventsForTask(conversationId)).find(e => e.type == "task_start")!.content as NewTaskInstruction
        this.logger.info(`answering question from ${taskStart.helpee_title}:${taskStart.helpee_id}`, {conversation_id: conversationId})
        await this.memory.recordEpisodicEvent({
            actor: "worker",
            type: "answer",
            conversation_id: conversationId,
            timestamp: DateTime.now().toISO(),
            content: content
        } as EpisodicEvent)
        this.environment.answer(taskStart.helpee_title, taskStart.helpee_id, {
            conversation_id: taskStart.helpee_conversation_id,
            request_id: taskStart.request_id,
            helper_title: this.agent_identifier.title,
            helper_identifier: this.agent_identifier.identifier,
            status: 'success',
            response: content
        }, conversationId)
        return Promise.resolve()
    }

    async processInstruction(instruction: NewTaskInstruction): Promise<void> {
        const conversationId = nanoid()
        this.logger.info(`Received new request from ${instruction.helpee_title}:${instruction.helpee_id}`, {conversation_id: conversationId})
        await this.memory.recordEpisodicEvent({
            actor: "worker",
            type: "task_start",
            conversation_id: conversationId,
            timestamp: DateTime.now().toISO()!,
            content: instruction
        })
        const plan = await this.memory.readPlan(instruction.input)
        await this.memory.recordEpisodicEvent({
            actor: "worker",
            type: "plan",
            conversation_id: conversationId,
            timestamp: DateTime.now().toISO()!,
            content: plan
        })

        const availableTools = this.llm.formatHelpers(Object.values(this.availableHelpers).map(x => x.tool_def))
        if (availableTools) {
            await this.memory.recordEpisodicEvent({
                actor: "worker",
                type: "plan",
                conversation_id: conversationId,
                timestamp: DateTime.now().toISO(),
                content: availableTools
            } as EpisodicEvent)
        }
        const instructions: string = await this.memory.readPlanInstructions(instruction.input)
        await this.memory.recordEpisodicEvent({
            actor: "worker",
            type: "instruction",
            conversation_id: conversationId,
            timestamp: DateTime.now().toISO(),
            content: instructions
        } as EpisodicEvent)
        return await this.think(conversationId);
    }

    async processDirectMessage(message: DirectMessage): Promise<void> {
        switch (message.type) {
            case "help_response":
                const response = message.contents as HelpResponse
                this.logger.info(`Received help response from ${response.helper_title}:${response.helper_identifier}`, {conversation_id: response.conversation_id})
                await this.memory.recordEpisodicEvent({
                    actor: "worker",
                    type: "response",
                    conversation_id: response.conversation_id,
                    timestamp: DateTime.now().toISO()!,
                    content: {
                        helper_title: response.helper_title,
                        response: response.response
                    }
                })
                return this.think(response.conversation_id)
        }
    }

    private async think(conversationId: string): Promise<void> {
        let rejecter: (error: any) => void = (error) => {
            this.logger.error("Error while thinking", error)
        }

        const returnPromise = new Promise<void>((resolve, reject) => {
            resolve(undefined)
            rejecter = reject
        })
        try {
            let numConcurrentThoughts = 0
            while (numConcurrentThoughts < this.maxConcurrentThoughts) {
                const events = await this.memory.readEpisodicEventsForTask(conversationId)
                this.logger.info(`Thinking with ${events.length} events`, {conversation_id: conversationId})
                const result = await this.llm.execute({model: this.model, temperature: this.temperature}, conversationId, events).catch(async e => {
                    this.logger.warn(e, {conversation_id: conversationId})
                    // add an error to the episodic memory, increment the thought counter, and continue
                    await this.memory.recordEpisodicEvent({
                        actor: "worker",
                        type: "llm_error",
                        conversation_id: conversationId,
                        timestamp: DateTime.now().toISO()!,
                        content: `${e}`
                    })

                    return {
                        thoughts: [],
                        observations: []
                    } as LLMResult
                })

                this.logger.info(`Return from LLM with ${result.thoughts.length} thoughts and ${result.helperCall ? ("a call to " + result.helperCall.title) : "no function call"}`, {conversation_id: conversationId})
                // first record the observations...
                for (const thought of result.observations) {
                    await this.memory.recordEpisodicEvent({
                        actor: "worker",
                        type: "observation",
                        conversation_id: conversationId,
                        timestamp: DateTime.now().toISO()!,
                        content: thought
                    })
                }
                // then record the thoughts...
                for (const thought of result.thoughts) {
                    await this.memory.recordEpisodicEvent({
                        actor: "worker",
                        type: "thought",
                        conversation_id: conversationId,
                        timestamp: DateTime.now().toISO(),
                        content: thought
                    } as EpisodicEvent)
                }
                // Now call helper function
                if (result.helperCall) {
                    let requestId = nanoid();
                    const help = result.helperCall as HelperCall
                    if (!this.availableHelpers[result.helperCall!.title]) {
                        await this.memory.recordEpisodicEvent({
                            actor: "worker",
                            type: "help",
                            conversation_id: conversationId,
                            timestamp: DateTime.now().toISO()!,
                            content: {
                                tool_name: result.helperCall.title,
                                arguments: result.helperCall.content
                            }
                        })
                        await this.processHallucination("bad_tool", conversationId, requestId, help)
                    } else {
                        await this.availableHelpers[result.helperCall!.title].call(this, conversationId, requestId, help)
                        return Promise.resolve()
                    }
                }
                ++numConcurrentThoughts
            }
            await this.processHallucination("bad_tool", conversationId, "", "")
            rejecter(`Too many consecutive thoughts for worker ${this.id_string()}, conversation_id:${conversationId}`)
        } catch (e) {
            rejecter(e)
        }

        return returnPromise
    }


    async processHallucination(type: HallucinationType, conversationId: string, requestId: string, contents: (HelperCall | string)) {
        switch (type) {
            case "bad_tool":
                const helpCall = contents as HelperCall
                await this.memory.recordEpisodicEvent({
                    actor: "worker",
                    type: "hallucination",
                    agent_id: this.agent_identifier.identifier,
                    conversation_id: conversationId,
                    timestamp: DateTime.now().toISO(),
                    content: `The tool ${helpCall.title} does not exist`
                } as EpisodicEvent)
                this.logger.warn(`LLM called invalid tool ${helpCall.title}`, {conversation_id: conversationId})
                break;
            case "too_many_thoughts":
                await this.memory.recordEpisodicEvent({
                    actor: "worker",
                    type: "hallucination",
                    agent_id: this.agent_identifier.identifier,
                    conversation_id: conversationId,
                    timestamp: DateTime.now().toISO(),
                    content: `You are thinking too much. Did you forgot to call a tool correctly? Perhaps the ${final_answer_tool.title} tool?`
                } as EpisodicEvent)
                this.logger.warn(`LLM is thinking too much`, {conversation_id: conversationId})
                break
        }
    }
}

export type HallucinationType = ("bad_tool" | "too_many_thoughts")
