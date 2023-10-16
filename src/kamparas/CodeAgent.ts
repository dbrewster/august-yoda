import {AgentEnvironment, EventContent, HelpResponse, NewTaskInstruction} from "@/kamparas/Environment";
import {nanoid} from "nanoid";
import {DirectMessage} from "@/kamparas/internal/RabbitAgentEnvironment";
import {Agent, AgentIdentifier, AgentOptions} from "@/kamparas/Agent";
import {DateTime} from "luxon";
import {AgentMemory} from "@/kamparas/Memory";

export interface CodeAgentOptions {
    title: string,
}

export abstract class CodeAgent extends Agent {
    constructor(options: AgentOptions) {
        super(options);
    }

    getLogType(): string {
        return "CodeAgent"
    }

    abstract exec(instruction: NewTaskInstruction, conversationId: string): Promise<void>

    async askForHelp(conversationId: string, agentTitle: string, content: EventContent, callContext: any, requestId = nanoid()): Promise<void> {
        // todo - record a memory event that holds the call to the child + the call context.
        await this.memory.recordEpisodicEvent({
            actor: "worker",
            type: "help",
            conversation_id: conversationId,
            timestamp: DateTime.now().toISO()!,
            callData: {
                requestId: requestId,
                context: callContext
            },
            content: {
                tool_name: agentTitle,
                arguments: content
            }
        })

        this.logger.info(`Asking help from ${agentTitle}`, {conversation_id: conversationId})
        // let this run in the background
        // noinspection ES6MissingAwait
        this.environment.askForHelp(this.title, this.identifier, conversationId, agentTitle, requestId, content)
    }

    async processDirectMessage(message: DirectMessage): Promise<void> {
        switch (message.type) {
            case "help_response":
                // todo -- use the call context stored in our memory to call an abstract method that can process this result

                const response = message.contents as HelpResponse
                const event = await this.memory.findEpisodicEvent({"callData.requestId": response.request_id, actor: "worker", type: "help"})
                if (!event) {
                    this.logger.error(`Could not find episodic event ${response.request_id}`)
                } else {
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
                    if (response.status === 'success') {
                        this.logger.info(`Received help response from ${response.helper_title}:${response.helper_identifier}`, {conversation_id: response.conversation_id})

                    } else {
                        this.logger.warn(`Received ERROR response from ${response.helper_title}:${response.helper_identifier}`, {conversation_id: response.conversation_id})
                    }
                    await this.processHelpResponse(response, event.callData.context)
                }
        }
    }

    abstract processHelpResponse(response: HelpResponse, callContext: any): Promise<void>

    async processInstruction(instruction: NewTaskInstruction): Promise<void> {
        const conversationId = nanoid()
        this.logger.info(`Received new request from ${instruction.helpee_title}:${instruction.helpee_id}`)
        await this.memory.recordEpisodicEvent({
            actor: "worker",
            type: "task_start",
            conversation_id: conversationId,
            timestamp: DateTime.now().toISO()!,
            content: instruction
        })
        try {
            await this.exec(instruction, conversationId)
        } catch (e) {
            this.logger.error("Error happened processing instruction", e)
            throw e
        }
    }
}
