import {
  AgentEnvironment,
  EnvironmentHandler,
  EventContent,
  HelpResponse,
  NewTaskInstruction
} from "@/kamparas/Environment";
import {ValidateFunction} from "ajv";
import {Logger} from "winston"
import {rootLogger} from "@/util/RootLogger"
import {DirectMessage} from "@/kamparas/internal/RabbitAgentEnvironment";
import YAML from "yaml";
import {Deferred, getDeferred} from "@/util/util";
import {nanoid} from "nanoid";

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

export type AgentStatus = ("stopped" | "started")

export abstract class Agent implements EnvironmentHandler {
  environment: AgentEnvironment;
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
        this.logger.error(`Error executing direct message ${JSON.stringify(directMessage)}`, error)
    }

  id_string() {
    return `title:${this.title}, id:${this.identifier}`
  }
}

export class BuiltinAgent extends Agent {
  private helperRequests: Record<string, Deferred<any>> = {}

  func: (args: any, agent: BuiltinAgent) => any

  constructor(options: AgentOptions, func: (args: any, agent: BuiltinAgent) => any) {
    super(options);
    this.func = func;
  }

  askForHelp<T>(conversationId: string, agentTitle: string, content: EventContent): Deferred<T> {
    const requestId = nanoid()
    this.helperRequests[requestId] = getDeferred()
    this.logger.info(`Asking help from ${agentTitle}`, {conversation_id: conversationId})
    this.environment.askForHelp(this.title, this.identifier, conversationId, agentTitle, requestId, content)
    return this.helperRequests[requestId]
  }

  async processDirectMessage(message: DirectMessage): Promise<void> {
    switch (message.type) {
      case "help_response":
        const response = message.contents as HelpResponse
        if (response.status === 'success') {
          this.logger.info(`Received help response from ${response.helper_title}:${response.helper_identifier}`, {conversation_id: response.conversation_id})
          this.helperRequests[response.request_id].resolve(response.response)
        } else {
          this.logger.warn(`Received ERROR response from ${response.helper_title}:${response.helper_identifier}`, {conversation_id: response.conversation_id})
          this.helperRequests[response.request_id].reject(response.response)
        }
        delete this.helperRequests[response.request_id]
    }
  }

  async processInstruction(instruction: NewTaskInstruction): Promise<void> {
    this.logger.info(`Received new request from ${instruction.helpee_title}:${instruction.helpee_id}`)
    let builtinFuncReturn: Record<string, any>

    try {
      if (this.func.constructor.name === "AsyncFunction") {
        builtinFuncReturn = await this.func(instruction.input as any, this)
      } else {
        builtinFuncReturn = this.func(instruction.input as any, this)
      }
    } catch (e) {
      this.logger.error("Error happened processing instruction", e)
      throw e
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
