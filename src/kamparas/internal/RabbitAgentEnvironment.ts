import {AgentEnvironment, EnvironmentHandler, EventContent, HelpResponse} from "@/kamparas/Environment";
import dotenv from "dotenv";
import {AMQPChannel} from "@cloudamqp/amqp-client";
import {getOrCreateMQConnection} from "@/kamparas/internal/RabbitMQ";
import {AsyncSemaphore} from "@/util/util";
import {nanoid} from "nanoid";

export interface HelpResponseMessage {
    task_id: string
    request_id: string
    helper_title: string
    helper_identifier: string

    response: EventContent
}

export interface HelpRequestMessage {
    helpee_id: string,
    helpee_title: string,
    request_id: string,
    job_title: string,
    message: EventContent
}

export const askQuestion = async (title: string, message: Record<string, any>): Promise<Record<string, any> | undefined> => {
    const connection = await getOrCreateMQConnection()
    const channel = await connection.channel();
    let result: (HelpResponseMessage | undefined)
    const sema = new AsyncSemaphore(0)
    const requestId = nanoid()
    const ourTitle = "ask_question"
    const ourId = nanoid()

    let queueName = ourTitle + "_" + ourId;
    await channel.queueDeclare(queueName, {durable: false})
    await channel.exchangeDeclare(queueName, "direct", {durable:false})
    await channel.queueBind(queueName, queueName, queueName)
    await channel.basicConsume(queueName,{noAck: false, exclusive: true}, (message) => {
        console.log("here")
        try {
            const body = message.bodyToString()
            if (body) {
                result = JSON.parse(body) as HelpResponseMessage
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

    const helpMessage: HelpRequestMessage = {
        helpee_title: ourTitle,
        helpee_id: ourId,
        request_id: requestId,
        job_title: title,
        message: message
    }

    // await channel.exchangeDeclare(title, "direct", {durable:false})
    await channel.basicPublish(title, title, JSON.stringify(helpMessage)).catch(reason => console.error(reason))

    console.log("wait")
    await sema.wait()
    console.log("here", result)
    await channel.queueDelete(queueName)
    return result?.response
}

export class RabbitAgentEnvironment extends AgentEnvironment {
    private handler?: EnvironmentHandler;

    constructor() {
        super();
        dotenv.config()
    }

    private channel?: AMQPChannel

    async disconnect() {
        await this.channel?.close()
        this.channel = undefined
        return Promise.resolve()
    }

    async answer(helpee_title: string, helpee_identifier: string, response: HelpResponse): Promise<void> {
        let queueName = this.makeIdentifierQueueName(helpee_title, helpee_identifier);
        // await this.channel!.exchangeDeclare(queueName, "direct", {durable:false})
        console.log("publish to ", queueName)
        await this.channel!.basicPublish(queueName, queueName, JSON.stringify(response)).catch(reason => console.error(reason))
        // console.log("getting queue")
        // const channel = await this.channel!.queue(queueName, {durable: false})
        // console.log("Sending message to ", queueName)
        // return channel.publish(JSON.stringify(response)).then(_ => {})
    }

    async askForHelp(helpeeTitle: string, helpeeIdentier: string, agentTitle: string, requestId: string, content: EventContent): Promise<void> {
        const message: HelpRequestMessage = {
            helpee_title: helpeeTitle,
            helpee_id: helpeeIdentier,
            request_id: requestId,
            job_title: agentTitle,
            message: content
        }
        const queue = await this.channel!.queue(agentTitle, {durable: true})
        return queue.publish(JSON.stringify(message)).then(_ => {
        })
    }

    async registerHandler(handler: EnvironmentHandler): Promise<void> {
        this.handler = handler
        const connection = await getOrCreateMQConnection()
        this.channel = await connection.channel();
        const queueName = handler.title
        await this.channel.queueDeclare(queueName, {durable: true})
        await this.channel.exchangeDeclare(queueName, "direct", {durable:false})
        await this.channel.queueBind(queueName, queueName, queueName)
        await this.channel.basicConsume(queueName,{noAck: false, exclusive: true}, async (message) => {
            console.log("Got message")
            try {
                const body = message.bodyToString()
                if (body) {
                    const json = JSON.parse(body) as HelpRequestMessage
                    const parseFn = handler.inputSchema
                    const parsedJson = handler.inputSchema(json.message)
                    if (!parseFn) {
                        // todo -- error handler
                        throw Error("Could not parse message into input schema: " + body)
                    }
                    const instr = handler.processInstruction({helpee_id: json.helpee_id, helpee_title: json.helpee_title, request_id: json.request_id, input: json.message}).then(_ => {
                        // console.log("acking")
                        // message.ack()
                    })
                    // ack after we process so a worker is working on one think at a time????
                    console.log("acking message in builtin")
                    await message.ack()
                    console.log("acking message in builtin... done")
                    await instr
                    console.log("waiting on instruc... done")
                    return
                }
            } catch (error) {
                // todo error handler...
                console.error("Error receiving message on ", JSON.stringify(handler, null, 2), error)
            }
            message.nack(false)
        }).catch(error => console.log(error))
        const workerQueue = await this.channel.queue(this.makeIdentifierQueueName(handler.title, handler.identifier), {durable: false});
        await workerQueue.subscribe({noAck: false, exclusive: false}, (message) => {
            try {
                const body = message.bodyToString()
                if (body) {
                    const json = JSON.parse(body) as HelpResponseMessage
                    handler.processHelpResponse(json)
                    message.ack()
                    return
                }
            } catch (error) {
                // todo error handler...
                console.error("Error receiving message on ", JSON.stringify(handler, null, 2), error)
            }
            message.nack(false)
        })

    }

    private makeIdentifierQueueName(title: string, identifier: string) {
        return title + "_" + identifier;
    }
}
