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
    task_id: string,
    request_id: string,
    job_title: string,
    message: EventContent
}

export const askQuestion = async (title: string, message: Record<string, any>): Promise<Record<string, any> | undefined> => {
    const connection = await getOrCreateMQConnection()
    const channel = await connection.channel();
    try {
        let result: (HelpResponseMessage | undefined)
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
            task_id: requestId,
            request_id: requestId,
            job_title: title,
            message: message
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

    async answer(helpee_title: string, helpee_identifier: string, response: HelpResponse): Promise<void> {
        let queueName = this.makeIdentifierQueueName(helpee_title, helpee_identifier);
        console.log("publish to ", queueName)
        await this.channel!.basicPublish(queueName, queueName, JSON.stringify(response)).catch(reason => console.error(reason))
        // console.log("getting queue")
        // const channel = await this.channel!.queue(queueName, {durable: false})
        // console.log("Sending message to ", queueName)
        // return channel.publish(JSON.stringify(response)).then(_ => {})
    }

    async askForHelp(helpeeTitle: string, helpeeIdentier: string, taskId: string, agentTitle: string, requestId: string, content: EventContent): Promise<void> {
        const message: HelpRequestMessage = {
            helpee_title: helpeeTitle,
            helpee_id: helpeeIdentier,
            task_id: taskId,
            request_id: requestId,
            job_title: agentTitle,
            message: content
        }
        await this.channel!.basicPublish(agentTitle, agentTitle, JSON.stringify(message)).catch(reason => console.error(reason))
    }

    async registerHandler(handler: EnvironmentHandler): Promise<void> {
        this.handler = handler
        const connection = await getOrCreateMQConnection()
        this.channel = await connection.channel();
        const queueName = handler.title
        await this.channel.queueDeclare(queueName, {durable: true})
        await this.channel.exchangeDeclare(queueName, "direct", {durable:false})
        await this.channel.queueBind(queueName, queueName, queueName)

        const thisQueueName = this.makeIdentifierQueueName(handler.title, handler.identifier)
        await this.channel.queueDeclare(thisQueueName, {durable: true})
        await this.channel.exchangeDeclare(thisQueueName, "direct", {durable:false})
        await this.channel.queueBind(thisQueueName, thisQueueName, thisQueueName)

        console.log("listening on worker title queue", queueName)
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
                    const instr = handler.processInstruction({helpee_id: json.helpee_id, helpee_title: json.helpee_title, task_id: json.task_id, request_id: json.request_id, input: json.message}).then(_ => {
                        // console.log("acking")
                        // message.ack()
                    })
                    // ack after we process so a worker is working on one think at a time????
                    console.log("acking message in", queueName)
                    await message.ack()
                    console.log("acking message... done")
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

        console.log("listening on worker identifier queue", thisQueueName)
        await this.channel.basicConsume(thisQueueName,{noAck: false, exclusive: true}, async (message) => {
            try {
                const body = message.bodyToString()
                if (body) {
                    const json = JSON.parse(body) as HelpResponseMessage
                    const instr = handler.processHelpResponse(json)
                    console.log("acking message in", thisQueueName)
                    await message.ack()
                    console.log("acking message... done")
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

    }

    private makeIdentifierQueueName(title: string, identifier: string) {
        return title + "_" + identifier;
    }
}
