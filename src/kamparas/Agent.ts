import {AgentMemory, EpisodicEvent} from "@/kamparas/Memory";
import {nanoid} from "nanoid";
import {AgentEnvironment, EnvironmentHandler, HelpResponse, NewTaskInstruction} from "@/kamparas/Environment";
import {HelperCall, LLM, ModelType} from "@/kamparas/LLM";
import {DateTime} from "luxon";
import {ValidateFunction} from "ajv";

export interface AgentIdentifier {
    title: string
    job_description: string
    identifier: string
    input_schema: ValidateFunction<object>
    answer_schema: ValidateFunction<object>
}

export interface AgentOptions extends AgentIdentifier {
    availableTools: AgentIdentifier[]
    environment: AgentEnvironment
}

export interface AutonomousAgentOptions extends AgentOptions {
    memory: AgentMemory
    llm: LLM
    maxConcurrentThoughts: number,
    model: ModelType,
    temperature?: number
}

export abstract class Agent implements EnvironmentHandler {
    environment: AgentEnvironment;

    protected constructor(options: AgentOptions) {
        this.title = options.title
        this.job_description = options.job_description
        this.inputSchema = options.input_schema
        this.outputSchema = options.answer_schema
        this.identifier = options.identifier
        this.environment = options.environment;
        this.environment.registerHandler(this)
    }

    title: string;
    job_description: string;
    inputSchema: ValidateFunction<object>;
    outputSchema: ValidateFunction<object>;
    identifier: string;

    abstract processHelpResponse(response: HelpResponse): Promise<void>

    abstract processInstruction(instruction: NewTaskInstruction): Promise<void>

    id_string() {
        return `title:${this.title}, id:${this.identifier}`
    }
}

export class BuiltinAgent<T, U> extends Agent {
    func: (args:T) => U


    constructor(options: AgentOptions, func: (args: T) => U) {
        super(options);
        this.func = func;
    }

    processHelpResponse(response: HelpResponse): Promise<void> {
        return Promise.resolve();
    }

    processInstruction(instruction: NewTaskInstruction): Promise<void> {
        const validatedInput = this.inputSchema(instruction.input) as T
        const taskId = nanoid()
        return new Promise(result => {
            console.log("going to answer")
            let buildinFuncReturn = this.func(instruction.input as T) as Record<string, any>;
            console.log("done building func")
            return this.environment.answer(instruction.helpee_title, instruction.helpee_id, {
                task_id: taskId,
                helper_identifier: this.identifier,
                helper_title: this.title,
                request_id: instruction.request_id,
                response: buildinFuncReturn
            }).then(answer => {
                console.log("going to answer...done")
                result(answer)
            })
        })
    }

}

export class AutonomousAgent extends Agent {
    availableHelpers: AgentIdentifier[]
    memory: AgentMemory;
    llm: LLM
    maxConcurrentThoughts: number
    model: ModelType
    temperature?: number

    constructor(options: AutonomousAgentOptions) {
        super(options);
        this.availableHelpers = options.availableTools
        this.memory = options.memory;
        this.llm = options.llm
        this.maxConcurrentThoughts = options.maxConcurrentThoughts
        this.model = options.model
        this.temperature = options.temperature
    }

    async processInstruction(instruction: NewTaskInstruction): Promise<void> {
        const plan = await this.memory.readPlan(instruction.input)
        const taskId = nanoid()
        await this.memory.recordEpisodicEvent({
            actor: "worker",
            type: "plan",
            task_id: taskId,
            timestamp: DateTime.now().toISO()!,
            content: plan
        })

        const availableTools = this.llm.formatHelpers(this.availableHelpers)
        await this.memory.recordEpisodicEvent({
            actor: "worker",
            type: "plan",
            task_id: taskId,
            timestamp: DateTime.now().toISO(),
            content: availableTools
        } as EpisodicEvent)
        const instructions: string = await this.memory.readPlanInstructions(instruction.input)
        await this.memory.recordEpisodicEvent({
            actor: "worker",
            type: "instruction",
            task_id: taskId,
            timestamp: DateTime.now().toISO(),
            content: instructions
        } as EpisodicEvent)
        return await this.think(taskId);
    }

    async processHelpResponse(response: HelpResponse): Promise<void> {
        await this.memory.recordEpisodicEvent({
            actor: "worker",
            type: "response",
            task_id: response.task_id,
            timestamp: DateTime.now().toISO(),
            content: response.response
        } as EpisodicEvent)
        return this.think(response.task_id)
    }

    private async think(taskId: string) {
        let numConcurrentThoughts = 0
        while (numConcurrentThoughts < this.maxConcurrentThoughts) {
            const events = await this.memory.readEpisodicEventsForTask(taskId)
            const result = await this.llm.execute({model: this.model, temperature: this.temperature}, events)

            // first record the thoughts...
            for (const thought of result.thoughts) {
                await this.memory.recordEpisodicEvent({
                    actor: "worker",
                    type: "thought",
                    task_id: taskId,
                    timestamp: DateTime.now().toISO(),
                    content: thought
                } as EpisodicEvent)
            }
            // Now call helper function
            if (result.helperCall) {
                let requestId = nanoid();
                await this.memory.recordEpisodicEvent({
                    actor: "worker",
                    type: "help",
                    task_id: taskId,
                    timestamp: DateTime.now().toISO(),
                    content: {
                        type: "help",
                        request_id: requestId,
                        content: result.helperCall
                    }
                } as EpisodicEvent)
                const help = result.helperCall as HelperCall
                await this.environment.askForHelp(this.title, this.identifier, help.title, requestId, help)
                return Promise.resolve()
            }
        }

        return Promise.reject(`Too many consecutive thoughts for worker ${this.id_string()}, task_id:${taskId}`);
    }
}