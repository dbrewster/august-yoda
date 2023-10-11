import { rootLogger } from "@/util/RootLogger";
import {ValidateFunction} from "ajv";
import {Logger} from "winston";
import {DirectMessage, DirectMessageType, TitleMessage} from "./internal/RabbitAgentEnvironment";

export type EventContent = Record<string, any>

export abstract class AgentEnvironment {
    logger: Logger = rootLogger;

    abstract registerHandler(handler: EnvironmentHandler): Promise<void>

    abstract askForHelp(helpeeTitle: string, helpeeIdentier: string, taskId: string, agentTitle: string, requestId: string, content: EventContent): Promise<void>

    abstract answer(helpee_title: string, helpee_identifier: string, response: HelpResponse, taskId: string): Promise<void>

    abstract shutdown(): Promise<void>

    setLogger(logger: Logger) {
        this.logger = logger
    }
}

export interface NewTaskInstruction {
    helpee_title: string,
    helpee_id: string,
    task_id: string,
    request_id: string,
    input: EventContent
}

export interface HelpResponse {
    task_id: string
    request_id: string
    helper_title: string
    helper_identifier: string

    response: EventContent
}

export interface EnvironmentHandler {
    /*
      The title of the agent. Used to identify the type of work the agent does
     */
    title: string

    /*
      The specific identifier for this agent
     */
    identifier: string

    /*
        The job description of this agent. A detailed description of what the agent does.
     */
    job_description: string

    /*
        The json input schema for this agent
     */
    inputSchema: ValidateFunction<Record<string, any>>

    /*
        Sent to an agent when a new task instruction is started
        @returns: true if the instruction was processed, false if not
     */
    processInstruction(instruction: NewTaskInstruction): Promise<void>

    /*
        Sent to an agent when response to a help request is received
        @returns: true if the instruction was processed, false if not
     */
    processDirectMessage(response: DirectMessage): Promise<void>

    processDecodeError(type: ("direct" | "instruction"), message: string): void
    processTitleMessageError(message: TitleMessage, error: any): void
    processDirectMessageError(directMessage: DirectMessage, error: any): void;
}
