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

    console.log("listening on ", ourTitle + "_" + ourId)
    const receiveQ = await channel.queue(ourTitle + "_" + ourId, {durable: false})
    console.log("listening on ", ourTitle + "_" + ourId, "done")
    await receiveQ.subscribe({noAck: false, exclusive: true}, (message) => {
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
    })

    const helpMessage: HelpRequestMessage = {
        helpee_title: ourTitle,
        helpee_id: ourId,
        request_id: requestId,
        job_title: title,
        message: message
    }
    const exchange = await channel.exchangeDeclare(title, "direct", {durable: false})

    const queue = await channel!.queue(title, {durable: false})
    await queue.publish(JSON.stringify(helpMessage))

    console.log("wait")
    await sema.wait()
    console.log("here", result)
    await receiveQ.delete()
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
        console.log("getting queue")
        const channel = await this.channel!.queue(this.makeIdentifierQueueName(helpee_title, helpee_identifier), {durable: false})
        console.log("Sending message to ", this.makeIdentifierQueueName(helpee_title, helpee_identifier))
        return channel.publish(JSON.stringify(response)).then(_ => {})
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
        // set up subscribe to our specific queue and the general queue for our job title
        const jobTitleQueue = await this.channel.queue(handler.title, {durable: false});
        await jobTitleQueue.subscribe({noAck: false, exclusive: false}, async (message) => {
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
        })
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
