import {
    AgentEnvironment,
    EnvironmentHandler,
    EventContent,
    HelpResponse,
    NewTaskInstruction, NoOpEnvironment
} from "@/kamparas/Environment";
import {ValidateFunction} from "ajv";
import {Logger} from "winston"
import {rootLogger} from "@/util/RootLogger"
import {DirectMessage} from "@/kamparas/internal/RabbitAgentEnvironment";
import YAML from "yaml";
import {AgentMemory, EpisodicEvent, NoOpMemory} from "@/kamparas/Memory";
import {DateTime} from "luxon";

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
}

export type AgentStatus = ("stopped" | "started")

export abstract class Agent implements EnvironmentHandler {
    environment: AgentEnvironment;
    memory: AgentMemory;
    agent_identifier: AgentIdentifier
    logger: Logger;
    status: AgentStatus = "stopped"

    protected constructor(options: AgentOptions) {
        this.title = options.title
        this.logger = rootLogger.child({type: this.getLogType(), title: options.title, identifier: options.identifier})
        this.job_description = options.job_description
        this.inputSchema = options.input_schema
        this.outputSchema = options.answer_schema
        this.identifier = options.identifier
        this.agent_identifier = options
        this.environment = new NoOpEnvironment()
        this.memory = new NoOpMemory()
    }

    title: string;
    job_description: string;
    inputSchema: ValidateFunction<object>;
    outputSchema: ValidateFunction<object>;
    identifier: string;

    getLogType() {
        return "agent"
    }

    initialize(memory: AgentMemory, environment: AgentEnvironment) {
        this.memory = memory
        this.environment = environment
        this.environment.setLogger(this.logger)
    }

    async start() {
        this.environment.setLogger(this.logger.child({subType: "environment"}))
        await this.environment.registerHandler(this)
        this.status = "started"
        this.logger.info(`Started ${this.title}:${this.identifier}`)
    }

    async shutdown() {
        await this.environment.shutdown()
        this.status = "stopped"
        this.logger.info(`Stopped ${this.title}:${this.identifier}`)
    }

    abstract processDirectMessage(response: DirectMessage): Promise<void>

    abstract processInstruction(instruction: NewTaskInstruction): Promise<void>

    processInstructionError(instruction: NewTaskInstruction, error: any): void {
        if (error instanceof Error) {
            this.logger.error(error)
        } else {
            this.logger.error("Error processing Instruction\n" + YAML.stringify(error))
        }
        const helpResponse: HelpResponse = {
            conversation_id: instruction.helpee_conversation_id,
            request_id: instruction.request_id,
            helper_title: this.title,
            helper_identifier: this.identifier,
            status: 'failure',
            response: {error: error instanceof Error ? error.toString() : error},
        }
        this.environment.answer(instruction.helpee_title, instruction.helpee_id, helpResponse, instruction.helpee_conversation_id).catch(err => {
            this.logger.error("Unable to answer", err)
        })
    }

    processDecodeError(type: "direct" | "instruction", message: string): void {
        this.logger.error(`Error decoding ${type} message: ${message}`)
    }

    processDirectMessageError(directMessage: DirectMessage, error: any): void {
        this.logger.error(`Error processing direct message ${JSON.stringify(directMessage)}`, error)
    }

    async doAnswer(conversationId: string, _requestId: string, content: EventContent) {
        const taskStart = (await this.memory.readEpisodicEventsForTask(conversationId)).find(e => e.type == "task_start")!.content as NewTaskInstruction
        this.logger.info(`answering question from ${taskStart.helpee_title}:${taskStart.helpee_id}`, {conversation_id: conversationId})
        await this.memory.recordEpisodicEvent({
            actor: "worker",
            type: "answer",
            conversation_id: conversationId,
            timestamp: DateTime.now().toISO(),
            content: content
        } as EpisodicEvent)
        // We are not waiting on purpose
        // noinspection ES6MissingAwait
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

    id_string() {
        return `title:${this.title}, id:${this.identifier}`
    }
}
