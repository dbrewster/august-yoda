import {AMQPClient} from "@cloudamqp/amqp-client";
import process from "process";
import {AMQPBaseClient} from "@cloudamqp/amqp-client/types/amqp-base-client";

let mqConnection: AMQPBaseClient | undefined

export const getOrCreateMQConnection = async () => {
    const ampq = new AMQPClient(process.env.RABBIT_Q as string)
    if (!mqConnection) {
        mqConnection = await ampq.connect();
    }

    return mqConnection
}

export const shutdown = async () => {
    if (mqConnection) {
        await mqConnection.close()
        mqConnection = undefined
    }
}
