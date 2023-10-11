import {AMQPClient} from "@cloudamqp/amqp-client";
import process from "process";

let mqConnection: AMQPClient | undefined

export const getOrCreateMQConnection = async () => {
    const ampq = new AMQPClient(process.env.RABBIT_Q as string)
    if (!mqConnection) {
        mqConnection = await ampq.connect() as AMQPClient
    }

    return mqConnection
}

export const shutdownRabbit = async () => {
    if (mqConnection) {
        await mqConnection.close()
        mqConnection = undefined
    }
}
