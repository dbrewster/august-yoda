import {
    AgentEnvironment,
    EnvironmentHandler,
    EventContent,
    HelpResponse,
    NewTaskInstruction
} from "@/kamparas/Environment";
import dotenv from "dotenv";
import {AMQPChannel, AMQPMessage} from "@cloudamqp/amqp-client";
import {getOrCreateMQConnection} from "@/kamparas/internal/RabbitMQ";

export type DirectMessageType = ("help_response" | "manager_call")

interface ManagerCall {
}

export interface DirectMessage {
    type: DirectMessageType,
    contents: (HelpResponse | ManagerCall)
}

export interface TitleMessage extends NewTaskInstruction {
}

export class RabbitAgentEnvironment extends AgentEnvironment {
    private handler?: EnvironmentHandler;

    constructor() {
        super();
        dotenv.config()
    }

    private publishDirectChannel?: AMQPChannel
    private publishHelpChannel?: AMQPChannel
    private listenDirectChannel?: AMQPChannel
    private listenTitleChannel?: AMQPChannel

    async shutdown() {
        if (this.publishDirectChannel) {
            await this.publishDirectChannel.close()
            this.publishDirectChannel = undefined
        }
        if (this.publishHelpChannel) {
            await this.publishHelpChannel.close()
            this.publishHelpChannel = undefined
        }
        if (this.listenDirectChannel) {
            await this.listenDirectChannel.close()
            this.listenDirectChannel = undefined
        }
        if (this.listenTitleChannel) {
            await this.listenTitleChannel.close()
            this.listenTitleChannel = undefined
        }
        return Promise.resolve()
    }

    async answer(helpee_title: string, helpee_identifier: string, helpResponse: HelpResponse, conversationId: string): Promise<void> {
        let queueName = this.makeIdentifierQueueName(helpee_title, helpee_identifier);
        const response = {
            type: "help_response",
            contents: helpResponse
        } as DirectMessage
        let responseStr = JSON.stringify(response);
        this.logger.debug(`publishing answer to queue ${queueName} ${responseStr.length} chars`, {conversation_id: conversationId})
        this.logger.debug(`Message data: ${responseStr}`, {conversation_id: conversationId})
        await this.publishDirectChannel!.basicPublish(queueName, queueName, responseStr).catch(reason => this.logger.error(reason))
    }

    async askForHelp(helpeeTitle: string, helpeeIdentier: string, conversationId: string, agentTitle: string, requestId: string, content: EventContent): Promise<void> {
        const message: TitleMessage = {
            helpee_title: helpeeTitle,
            helpee_id: helpeeIdentier,
            helpee_conversation_id: conversationId,
            request_id: requestId,
            input: content
        }
        let messageStr = JSON.stringify(message);
        this.logger.debug(`Asking for help from ${agentTitle} ${messageStr.length} chars`, {conversation_id: conversationId})
        this.logger.debug(`Message data: ${messageStr}`, {conversation_id: conversationId})
        await this.publishHelpChannel!.basicPublish(agentTitle, agentTitle, messageStr).catch(reason => console.error(reason))
    }

    async registerHandler(handler: EnvironmentHandler): Promise<void> {
        this.handler = handler
        const connection = await getOrCreateMQConnection()
        this.publishDirectChannel = await connection.channel();
        this.publishHelpChannel = await connection.channel();
        this.listenDirectChannel = await connection.channel();
        this.listenTitleChannel = await connection.channel();

        this.listenDirectChannel = await connection.channel();
        const queueName = handler.title
        await this.listenTitleChannel.queueDeclare(queueName, {durable: true})
        await this.listenTitleChannel.exchangeDeclare(queueName, "direct", {durable: false})
        await this.listenTitleChannel.queueBind(queueName, queueName, queueName)

        const thisQueueName = this.makeIdentifierQueueName(handler.title, handler.identifier)
        await this.listenDirectChannel.queueDeclare(thisQueueName, {durable: true})
        await this.listenDirectChannel.exchangeDeclare(thisQueueName, "direct", {durable: false})
        await this.listenDirectChannel.queueBind(thisQueueName, thisQueueName, thisQueueName)

        this.logger.info(`listening on worker title queue ${queueName}`)
        await this.listenTitleChannel.basicConsume(queueName, {noAck: false}, async (msg) => this.processNewInstruction(msg)).catch(error => this.logger.error(error))

        this.logger.info(`listening on worker identifier queue ${thisQueueName}`)
        await this.listenDirectChannel.basicConsume(thisQueueName, {noAck: false}, (msg) => this.processDirectMessage(msg)).catch(error => this.logger.error(error))
    }

    private async processDirectMessage(message: AMQPMessage) {
        try {
            const body = message.bodyToString()
            this.logger.debug(`Received direct message ${body ? body.length : 0} chars`)
            if (body) {
                try {
                    const directMessage = JSON.parse(body) as DirectMessage
                    this.logger.debug(`calling direct handler`)
                    // let this run in the background
                    this.handler!.processDirectMessage(directMessage).catch(error => this.handler!.processDirectMessageError(directMessage, error)).catch(error => {
                        this.logger.error("Unable to process direct message", {body: body, error: error})
                    })
                    await message.ack()
                    return
                } catch (error) {
                    this.handler!.processDecodeError("direct", `Could not decode direct message: ${body} to object. Error: ${JSON.stringify(error)}`)
                }
            } else {
                    this.handler!.processDecodeError("direct", `Received empty message`)
            }
        } catch (error) {
            this.handler!.processDecodeError("direct",`Could not decode direct message to string. Error: ${JSON.stringify(error)}`)
        }
        await message.nack(false)
    }

    private async processNewInstruction(message: AMQPMessage) {
        try {
            const body = message.bodyToString()
            this.logger.debug(`Received title message ${body ? body.length : 0} chars`)
            if (body) {
                try {
                    const titleMessage = JSON.parse(body) as TitleMessage
                    const parsedJson = this.handler!.inputSchema(titleMessage.input)
                    if (parsedJson) {
                        // run in background
                        this.logger.debug(`calling title handler`)
                        this.handler!.processInstruction(titleMessage).catch(error => {
                            this.handler!.processInstructionError(titleMessage, error)
                        })
                    } else {
                        this.handler?.processInstructionError(titleMessage, {
                            description: "Could not parse input based on input schema",
                            parsing_errors: this.handler!.inputSchema.errors
                        })
                    }
                    // ack after we process so a worker is working on one think at a time????
                    await message.ack()
                    return
                } catch (error) {
                    this.handler!.processDecodeError("instruction", `Could not decode direct message: ${body} to object. Error: ${JSON.stringify(error)}`)
                }
            } else {
                    this.handler!.processDecodeError("instruction", `Received empty message`)
            }
        } catch (error) {
            if (!this.handler) {
                this.logger.error("instruction",`Could not decode direct message on ${message.exchange} to string. Error: ${JSON.stringify(error)} -- ${this.logger}`)
            }
            this.handler!.processDecodeError("instruction",`Could not decode direct message to string. Error: ${JSON.stringify(error)}`)
        }
        await message.nack(false)
    }

    private makeIdentifierQueueName(title: string, identifier: string) {
        return title + "_" + identifier;
    }
}
