import {HelperCall, LLM, LLMResult, NoOpLLM} from "@/kamparas/LLM";
import {DateTime} from "luxon";
import {EventContent, HelpResponse, NewTaskInstruction} from "@/kamparas/Environment";
import {EpisodicEvent} from "@/kamparas/Memory";
import {rootLogger} from "@/util/RootLogger";
import {nanoid} from "nanoid";
import {DirectMessage} from "@/kamparas/internal/RabbitAgentEnvironment";
import {APIError} from "openai";
import {Agent, AgentInitOptions, AgentOptions, AgentTool} from "@/kamparas/Agent";
import {AgentRegistry} from "@/kamparas/AgentRegistry";
import {Error} from "sequelize"
import {getOrCreateSchemaManager} from "@/kamparas/SchemaManager"
import {ValidateFunction} from "ajv";

export const final_answer_tool = {
    title: "final_answer",
    job_description: "return the final answer to the user.",
} as AgentTool

export type AgentToolCall = {
    tool_def: AgentTool
    call: (agent: AutonomousAgent, conversationId: string, requestId: string, context: EventContent, help: HelperCall) => Promise<void>
}

const addThoughtToToolSchema = (inSchema: ValidateFunction): ValidateFunction<any> => {
    const schema = {...inSchema.schema as Record<string, any>}
    if (schema.properties.__thought) {
        console.trace("WTF!!!")
        return inSchema
    } else {
        schema.properties.__thought = {
            type: "string",
            description: "A very detailed description of the thought you have made"
        }

        const required = schema.required as string[]
        required.push("__thought")
        return getOrCreateSchemaManager().compileObj(schema)
    }
}

async function addThoughtToMemory(content: EventContent, agent: AutonomousAgent, conversationId: string) {
    const thought = content.__thought as string
    if (thought) {
        await agent.memory.recordEpisodicEvent({
            actor: "worker",
            type: "thought",
            conversation_id: conversationId,
            timestamp: DateTime.now().toISO(),
            content: thought
        } as EpisodicEvent)
        delete content.__thought
    }
}

export const remoteAgentCall = (toolName: string, addThought: boolean): AgentToolCall => {
    const agent = AgentRegistry.getIdentifier(toolName)
    if (!agent) {
        throw `Invalid agent name ${toolName}`
    }
    return ({
        tool_def: agent,
        call: async (agent: AutonomousAgent, conversationId: string, requestId: string, context: EventContent, help: HelperCall): Promise<void> => {
            let content = help.content;
            if (addThought) {
                await addThoughtToMemory(content, agent, conversationId);
            }
            await agent.memory.recordEpisodicEvent({
                actor: "worker",
                type: "help",
                conversation_id: conversationId,
                timestamp: DateTime.now().toISO()!,
                callData: {
                    requestId: requestId,
                    context: undefined,
                },
                content: {
                    tool_name: help.title,
                    arguments: content
                }
            })
            agent.logger.info(`Asking help from ${help.title} (request_id ${requestId})`, {conversation_id: conversationId})
            // noinspection ES6MissingAwait
            agent.environment.askForHelp(agent.title, agent.identifier, conversationId, help.title, requestId, context, content)
            return Promise.resolve()
        }
    })
}
export const localAgentCall = (tool_def: AgentTool, fn: (conversationId: string, requestId: string, content: EventContent) => Promise<void>): AgentToolCall => ({
    tool_def: tool_def,
    call: (_agent: AutonomousAgent, conversationId: string, requestId: string, _context: EventContent, help: HelperCall): Promise<void> => {
        return fn(conversationId, requestId, help.content)
    }
})

export interface AutonomousAgentOptions extends AgentOptions {
    upgradeThoughtsThreshold: number,
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
    upgradeThoughtsThreshold: number
    initial_plan: string
    overwrite_plan: boolean
    initial_plan_instructions: string
    overwrite_plan_instructions: boolean

    private compiledTools?: Record<string, AgentToolCall>

    constructor(options: AutonomousAgentOptions) {
        super(options);
        this.availableTools = options.availableTools

        this.maxConcurrentThoughts = options.maxConcurrentThoughts
        this.upgradeThoughtsThreshold = options.upgradeThoughtsThreshold
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
        if (this.availableTools) {
            this.availableTools.forEach(t => {
                availableHelpers[t] = remoteAgentCall(t, true)
            })
        }

        // availableHelpers["create_observation"] = remoteAgentCall("create_observation", false)
        // availableHelpers["create_observation_thought"] = remoteAgentCall("create_observation_thought", false)
        // availableHelpers["create_observation_answer"] = remoteAgentCall("create_observation_answer", false)

        const doAnswerThisPtr = this
        availableHelpers[final_answer_tool.title] = localAgentCall({
            ...final_answer_tool,
            input_schema: addThoughtToToolSchema(this.outputSchema)
        }, this.recordThoughtAndAnswer.bind(doAnswerThisPtr))

        return availableHelpers
    }

    async recordThoughtAndAnswer(conversationId: string, _requestId: string, content: EventContent) {
        await addThoughtToMemory(content, this, conversationId)
        return this.doAnswer(conversationId, _requestId, content)
    }

    async processInstruction(instruction: NewTaskInstruction): Promise<void> {
        const conversationId = nanoid()
        this.logger.info(`Received new request (${instruction.request_id}) from ${instruction.helpee_title}:${instruction.helpee_id}`, {request_id: instruction.request_id, conversation_id: conversationId})
        await this.memory.recordEpisodicEvent({
            actor: "worker",
            type: "task_start",
            conversation_id: conversationId,
            timestamp: DateTime.now().toISO()!,
            content: instruction
        })
        const plan = await this.memory.readPlan({...instruction.input, "__context__": instruction.context})
        await this.memory.recordEpisodicEvent({
            actor: "worker",
            type: "plan",
            conversation_id: conversationId,
            timestamp: DateTime.now().toISO()!,
            content: plan
        })

        await this.memory.recordEpisodicEvent({
            actor: "worker",
            type: "available_tools",
            conversation_id: conversationId,
            timestamp: DateTime.now().toISO()!,
            content: this.availableTools
        })
        let instructions: string = await this.memory.readPlanInstructions({...instruction.input, "__context__": instruction.context})
        /*
                instructions = `Everything you do will be recorded with the provided tools that record observations, thoughts, and answers to the observations.
          Observations are arranged in a tree format. Each node in the tree must conform to the following sequence of calls describe in EBNF form:
            root_observation_chain ::= record_chain final_answer
            record_chain ::= create_observation think_and_execute
            think_and_execute ::= <create_observation_thought>+ <execute_other_tools> <think_and_execute>? |
                                  <create_observation_thought>+ <record_chain> <think_and_execute>? |
                                  <create_observation_thought>+
          where
            create_observation = call to the create_observation tool
            create_observation_thought = call to the create_observation_thought tool
            execute_other_tools = call to any other tool available
            final_answer = call to the final_answer tool

          The root observation_id is "root".

          The root of your observation chain is root_observation_chain. Make sure you call create_observation_answer for all new observation chains including the root observation chain for id "root"
        ` + instructions
        */

        await this.memory.recordEpisodicEvent({
            actor: "worker",
            type: "instruction",
            conversation_id: conversationId,
            timestamp: DateTime.now().toISO(),
            content: instructions
        } as EpisodicEvent)
        if (process.env.ENABLE_SEMANTIC_MEMORIES === "true") {
            let memories = await this.memory.searchSemanticMemory(instructions, 1000)
            memories.sort((a, b) => a.relevance * a.memory.importance < b.relevance * b.memory.importance ? 1 : -1)
            for (let memory of memories.slice(0, Math.min(memories.length, 3))) {
                await this.memory.recordEpisodicEvent({
                    actor: "worker",
                    type: "memory",
                    conversation_id: conversationId,
                    timestamp: DateTime.now().toISO(),
                    content: memory.memory.memory,  // we may want more here so we can prompt the agent with context.
                } as EpisodicEvent)
            }
        }
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
                    this.logger.info(`Received help response (rid ${response.request_id}) from ${response.helper_title}:${response.helper_identifier}`, {conversation_id: response.conversation_id})
                } else {
                    this.logger.warn(`Received ERROR response (rid ${response.request_id}) from ${response.helper_title}:${response.helper_identifier}`, {conversation_id: response.conversation_id})
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
            if (!this.compiledTools) {
                this.compiledTools = this.buildHelpers()
            }
            let numConcurrentThoughts = 0
            const cutoffPoint = this.maxConcurrentThoughts * 2
            while (numConcurrentThoughts < cutoffPoint) {
                const events = await this.memory.readEpisodicEventsForTask(conversationId)
                let llm = this.llm
                if (numConcurrentThoughts >= this.upgradeThoughtsThreshold) {
                    llm = llm.upgradeModel()
                }
                const taskStart = events.find(e => e.type == "task_start")!.content as NewTaskInstruction
                const availableHelpers = this.compiledTools
                this.logger.info(`Thinking with ${events.length} events: (Thought #${numConcurrentThoughts})`, {conversation_id: conversationId})
                const result = await llm.execute({}, conversationId, events, Object.values(availableHelpers).map(h => h.tool_def)).catch(async e => {
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
                            callData: {
                                requestId: requestId,
                                context: undefined
                            },
                            content: {
                                tool_name: result.helperCall.title,
                                arguments: result.helperCall.content
                            }
                        })
                        await this.processHallucination("bad_tool", conversationId, requestId, help)
                    } else {
                        await availableHelpers[result.helperCall!.title].call(this, conversationId, requestId, taskStart.context, help)
                        return
                    }
                }
                ++numConcurrentThoughts
                if (numConcurrentThoughts == this.maxConcurrentThoughts) {
                    await this.processHallucination("too_many_thoughts", conversationId, "", "")
                }
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
                    content: `You are thinking too much. Are you caught in an infinite thought loop? Did you forgot to call a tool correctly? Perhaps the ${final_answer_tool.title} tool?`
                } as EpisodicEvent)
                this.logger.warn(`LLM is thinking too much`, {conversation_id: conversationId})
                break
        }
    }
}

export type HallucinationType = ("bad_tool" | "too_many_thoughts")