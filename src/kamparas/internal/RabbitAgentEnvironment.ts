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
import {AsyncSemaphore} from "@/util/util";
import {nanoid} from "nanoid";

export type DirectMessageType = ("help_response" | "manager_call")

export interface HelpMessageResponse {
    task_id: string
    request_id: string
    helper_title: string
    helper_identifier: string

    response: EventContent
}

interface ManagerCall {
}

export interface DirectMessage {
    type: DirectMessageType,
    contents: (HelpMessageResponse | ManagerCall)
}

export interface TitleMessage extends NewTaskInstruction {
}

/*
export const askQuestion = async (title: string, message: Record<string, any>): Promise<Record<string, any> | undefined> => {
    const connection = await getOrCreateMQConnection()
    const channel = await connection.channel();
    try {
        let result: (DirectMessage | undefined)
        const sema = new AsyncSemaphore(0)
        const requestId = nanoid()
        console.log(`Asking Question to ${title}: ${requestId}`)
        const ourTitle = "ask_question"
        const ourId = nanoid()

        let queueName = ourTitle + "_" + ourId;
        await channel.queueDeclare(queueName, {durable: false})
        await channel.exchangeDeclare(queueName, "direct", {durable: false})
        await channel.queueBind(queueName, queueName, queueName)
        await channel.basicConsume(queueName, {noAck: false, exclusive: true}, (message) => {
            try {
                const body = message.bodyToString()
                if (body) {
                    result = JSON.parse(body) as DirectMessage
                    console.log("res", result)
                    // ack after we process so a worker is working on one think at a time????
                    message.ack()
                    console.log("signal")
                    sema.signal()
                    return
                }
            } catch (error) {
                // todo error handler...
                console.error("Error receiving message on ", error)
            }
            message.nack()
        }).catch(error => console.error("err", error))

        const helpMessage: TitleMessage = {
            helpee_title: ourTitle,
            helpee_id: ourId,
            task_id: requestId,
            request_id: requestId,
            input: message
        }

        console.log("publishing on queue", title)
        // await channel.exchangeDeclare(title, "direct", {durable:false})
        await channel.basicPublish(title, title, JSON.stringify(helpMessage)).catch(reason => console.error(reason))

        console.log("wait")
        await sema.wait()
        console.log("here", result)
        await channel.queueDelete(queueName)
        return result?.response
    } finally {
        await channel.close()
    }
}
*/

export class RabbitAgentEnvironment extends AgentEnvironment {
    private handler?: EnvironmentHandler;

    constructor() {
        super();
        dotenv.config()
    }

    private channel?: AMQPChannel

    async shutdown() {
        await this.channel?.close()
        this.channel = undefined
        return Promise.resolve()
    }

    async answer(helpee_title: string, helpee_identifier: string, helpResponse: HelpResponse): Promise<void> {
        let queueName = this.makeIdentifierQueueName(helpee_title, helpee_identifier);
        const response = {
            type: "help_response",
            contents: helpResponse
        } as DirectMessage
        let responseStr = JSON.stringify(response);
        this.logger.debug(`publishing answer to queue ${queueName} ${responseStr.length} chars`)
        this.logger.debug(`Message data: ${responseStr}`)
        await this.channel!.basicPublish(queueName, queueName, responseStr).catch(reason => console.error(reason))
    }

    async askForHelp(helpeeTitle: string, helpeeIdentier: string, taskId: string, agentTitle: string, requestId: string, content: EventContent): Promise<void> {
        const message: TitleMessage = {
            helpee_title: helpeeTitle,
            helpee_id: helpeeIdentier,
            task_id: taskId,
            request_id: requestId,
            input: content
        }
        let messageStr = JSON.stringify(message);
        this.logger.debug(`Asking for help from ${agentTitle} ${messageStr.length} chars`)
        this.logger.debug(`Message data: ${messageStr}`)
        await this.channel!.basicPublish(agentTitle, agentTitle, messageStr).catch(reason => console.error(reason))
    }

    async registerHandler(handler: EnvironmentHandler): Promise<void> {
        this.handler = handler
        const connection = await getOrCreateMQConnection()
        this.channel = await connection.channel();
        const queueName = handler.title
        await this.channel.queueDeclare(queueName, {durable: true})
        await this.channel.exchangeDeclare(queueName, "direct", {durable: false})
        await this.channel.queueBind(queueName, queueName, queueName)

        const thisQueueName = this.makeIdentifierQueueName(handler.title, handler.identifier)
        await this.channel.queueDeclare(thisQueueName, {durable: true})
        await this.channel.exchangeDeclare(thisQueueName, "direct", {durable: false})
        await this.channel.queueBind(thisQueueName, thisQueueName, thisQueueName)

        this.logger.info(`listening on worker title queue ${queueName}`)
        await this.channel.basicConsume(queueName, {noAck: false, exclusive: true}, async (msg) => this.processNewInstruction(msg)).catch(error => console.log(error))

        this.logger.info(`listening on worker identifier queue ${thisQueueName}`)
        await this.channel.basicConsume(thisQueueName, {noAck: false, exclusive: true}, (msg) => this.processDirectMessage(msg))
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
                    this.handler!.processDirectMessage(directMessage).catch(error => this.handler!.processDirectMessageError(directMessage, error))
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
                    const parseFn = this.handler!.inputSchema
                    const parsedJson = this.handler!.inputSchema(titleMessage.input)
                    if (parsedJson) {
                        // run in background
                        this.logger.debug(`calling title handler`)
                        this.handler!.processInstruction(titleMessage)
                    } else {
                        this.handler?.processTitleMessageError(titleMessage, "Could not parse input based on input schema")
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
                console.error("instruction",`Could not decode direct message on ${message.exchange} to string. Error: ${JSON.stringify(error)} -- ${this.logger}`)
            }
            this.handler!.processDecodeError("instruction",`Could not decode direct message to string. Error: ${JSON.stringify(error)}`)
        }
        await message.nack(false)
    }

    private makeIdentifierQueueName(title: string, identifier: string) {
        return title + "_" + identifier;
    }
}
