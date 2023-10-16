import {rootLogger} from "@/util/RootLogger";
import {ValidateFunction} from "ajv";
import {Logger} from "winston";
import {DirectMessage} from "./internal/RabbitAgentEnvironment";

export type EventContent = Record<string, any>

export abstract class AgentEnvironment {
    logger: Logger = rootLogger;

    abstract registerHandler(handler: EnvironmentHandler): Promise<void>

    abstract askForHelp(helpeeTitle: string, helpeeIdentier: string, conversationId: string, agentTitle: string, requestId: string, content: EventContent): Promise<void>

    abstract answer(helpee_title: string, helpee_identifier: string, response: HelpResponse, conversationId: string): Promise<void>

    abstract shutdown(): Promise<void>

    setLogger(logger: Logger) {
        this.logger = logger
    }
}

export class NoOpEnvironment extends AgentEnvironment {
    answer(helpee_title: string, helpee_identifier: string, response: HelpResponse, conversationId: string): Promise<void> {
        return Promise.resolve(undefined);
    }

    askForHelp(helpeeTitle: string, helpeeIdentier: string, conversationId: string, agentTitle: string, requestId: string, content: EventContent): Promise<void> {
        return Promise.resolve(undefined);
    }

    registerHandler(handler: EnvironmentHandler): Promise<void> {
        return Promise.resolve(undefined);
    }

    shutdown(): Promise<void> {
        return Promise.resolve(undefined);
    }

}
export interface NewTaskInstruction {
    // The following three fields are here so that the title, id, and conversation_id of the caller can be passed back on the call back
    helpee_title: string,
    helpee_id: string,
    helpee_conversation_id: string,
    request_id: string,
    input: EventContent
}

export interface HelpResponse {
    conversation_id: string
    request_id: string
    helper_title: string
    helper_identifier: string
    status: ("success" | "failure")
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

    processInstructionError(instruction: NewTaskInstruction, error: any): void
    processDecodeError(type: ("direct" | "instruction"), message: string): void
    processDirectMessageError(directMessage: DirectMessage, error: any): void;
}
