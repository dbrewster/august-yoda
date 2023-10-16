import {HelperCall, LLM, LLMResult, NoOpLLM} from "@/kamparas/LLM";
import {DateTime} from "luxon";
import {EventContent, HelpResponse, NewTaskInstruction} from "@/kamparas/Environment";
import {EpisodicEvent} from "@/kamparas/Memory";
import {rootLogger} from "@/util/RootLogger";
import {nanoid} from "nanoid";
import {DirectMessage} from "@/kamparas/internal/RabbitAgentEnvironment";
import {APIError} from "openai";
import {Agent, AgentInitOptions, AgentOptions, AgentTool} from "@/kamparas/Agent";
import {getIdentifier} from "@/kamparas/AgentRegistry";
import {Error} from "sequelize"

export const final_answer_tool = {
    title: "final_answer",
    job_description: "return the final answer to the user.",
} as AgentTool


export type AgentToolCall = {
    tool_def: AgentTool
    call: (agent: AutonomousAgent, conversationId: string, requestId: string, help: HelperCall) => Promise<void>
}

export const remoteAgentCall = (toolName: string): AgentToolCall => {
    const agent = getIdentifier(toolName)
    return ({
        tool_def: agent,
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
}
export const localAgentCall = (tool_def: AgentTool, fn: (conversationId: string, requestId: string, content: EventContent) => Promise<void>): AgentToolCall => ({
    tool_def: tool_def,
    call: (_agent: AutonomousAgent, conversationId: string, requestId: string, help: HelperCall): Promise<void> => {
        return fn(conversationId, requestId, help.content)
    }
})

export interface AutonomousAgentOptions extends AgentOptions {
    maxConcurrentThoughts: number,
    initial_plan: string,
    overwrite_plan: boolean,
    initial_plan_instructions: string,
    overwrite_plan_instructions: boolean
    availableTools: string[]
}

export interface AutonomousAgentInitOptions extends AgentInitOptions {
    llm: LLM
}

export class AutonomousAgent extends Agent {
    availableTools: string[]
    llm: LLM = new NoOpLLM()
    maxConcurrentThoughts: number
    initial_plan: string
    overwrite_plan: boolean
    initial_plan_instructions: string
    overwrite_plan_instructions: boolean

    constructor(options: AutonomousAgentOptions) {
        super(options);
        this.availableTools = options.availableTools

        this.maxConcurrentThoughts = options.maxConcurrentThoughts
        this.initial_plan = options.initial_plan
        this.overwrite_plan = options.overwrite_plan
        this.initial_plan_instructions = options.initial_plan_instructions
        this.overwrite_plan_instructions = options.overwrite_plan_instructions
    }

    initialize(options: AutonomousAgentInitOptions): void {
        super.initialize(options);
        this.llm = options.llm
        this.llm.setLogger(rootLogger)
    }

    async start(): Promise<void> {
        await super.start();
        this.llm.setLogger(this.logger.child({subType: "llm"}))
        this.memory.setLogger(this.logger.child({subType: "memory"}))
        if (!(await this.memory.planExists()) || this.overwrite_plan) {
            await this.memory.recordPlan(this.initial_plan)
        }
        if (!(await this.memory.planInstructionsExists()) || this.overwrite_plan) {
            await this.memory.recordPlanInstructions(this.initial_plan_instructions)
        }
    }

    protected buildHelpers() {
        const availableHelpers: Record<string, AgentToolCall> = {}
        this.availableTools.forEach(t => {
            availableHelpers[t] = remoteAgentCall(t)
        })

        const doAnswerThisPtr = this
        availableHelpers[final_answer_tool.title] = localAgentCall({
            ...final_answer_tool,
            input_schema: this.outputSchema
        }, this.doAnswer.bind(doAnswerThisPtr))

        return availableHelpers
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

        const availableTools = this.llm.formatHelpers(this.availableTools)
        if (availableTools) {
            await this.memory.recordEpisodicEvent({
                actor: "worker",
                type: "available_tools",
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
        /*
                await this.memory.recordEpisodicEvent({
                    actor: "worker",
                    type: "thought",
                    conversation_id: conversationId,
                    timestamp: DateTime.now().toISO(),
                    content: `I should first create a plan on my own to solve the problem and then start solving the problem step by step. I record that plan using the provided tool or return it as a message`
                } as EpisodicEvent)
        */

        return await this.think(conversationId);
    }

    async processDirectMessage(message: DirectMessage): Promise<void> {
        switch (message.type) {
            case "help_response":
                const response = message.contents as HelpResponse
                if (response.status === 'success') {
                    this.logger.info(`Received help response from ${response.helper_title}:${response.helper_identifier}`, {conversation_id: response.conversation_id})
                } else {
                    this.logger.warn(`Received ERROR response from ${response.helper_title}:${response.helper_identifier}`, {conversation_id: response.conversation_id})
                }
                await this.memory.recordEpisodicEvent({
                    actor: "worker",
                    type: "response",
                    conversation_id: response.conversation_id,
                    timestamp: DateTime.now().toISO()!,
                    content: {
                        helper_title: response.helper_title,
                        status: response.status,
                        response: response.response
                    }
                })
                return this.think(response.conversation_id)
        }
    }

    private async handleError(conversationId: string, error: any) {
        this.logger.error(`Error while thinking (conversationId: ${conversationId})`, error)
        const taskStart = (await this.memory.readEpisodicEventsForTask(conversationId)).find(e => e.type == "task_start")!.content as NewTaskInstruction
        await this.environment.answer(taskStart.helpee_title, taskStart.helpee_id, {
            conversation_id: taskStart.helpee_conversation_id,
            request_id: taskStart.request_id,
            helper_title: this.agent_identifier.title,
            helper_identifier: this.agent_identifier.identifier,
            status: 'failure',
            response: {error: error instanceof Error ? error.toString() : error}
        }, conversationId)
    }

    private async think(conversationId: string): Promise<void> {

        try {
            let numConcurrentThoughts = 0
            while (numConcurrentThoughts < this.maxConcurrentThoughts) {
                const events = await this.memory.readEpisodicEventsForTask(conversationId)
                const availableHelpers = this.buildHelpers()
                this.logger.info(`Thinking with ${events.length} events: (Thought #${numConcurrentThoughts})`, {conversation_id: conversationId})
                const result = await this.llm.execute({}, conversationId, events, Object.values(availableHelpers).map(h => h.tool_def)).catch(async e => {
                    // open AI api errors indicate a request issue the caller should know about
                    if (e instanceof APIError) {
                        e.name = "OpenAi APIError"
                        throw e
                    }
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
                    if (!availableHelpers[result.helperCall!.title]) {
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
                        await availableHelpers[result.helperCall!.title].call(this, conversationId, requestId, help)
                        return
                    }
                }
                ++numConcurrentThoughts
            }
            await this.processHallucination("too_many_thoughts", conversationId, "", "")
            await this.handleError(conversationId, `Too many consecutive thoughts for worker ${this.id_string()}, conversation_id:${conversationId}`)
        } catch (e) {
            await this.handleError(conversationId, e)
        }

        return
    }


    async processHallucination(type: HallucinationType, conversationId: string, _requestId: string, contents: (HelperCall | string)) {
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
