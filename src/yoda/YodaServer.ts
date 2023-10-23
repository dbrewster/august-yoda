import express, {Application, Request, Response} from 'express';

import bodyParser from "body-parser";
import {createServer, IncomingMessage, Server, ServerResponse} from "http";
import {RawData, WebSocket, WebSocketServer} from "ws";
import {nanoid} from "nanoid";
import {createIdPatternMatcher, WCMatch, YodaEvent} from "@/util/llm/EventHandler";
import {ErrorRequestHandler} from "express-serve-static-core";
import {promiseMiddleware} from "@/util/promise-middleware";

export class YodaServer {
    server?: Server<typeof IncomingMessage, typeof ServerResponse>

    constructor() {

    }

    async initialize() {
        const handler: ErrorRequestHandler = (err, req, res, next) => {
            console.trace("Error in handling request", err)
            res.status(500)
            res.send(err)
        }

        const app: Application = express();
        // @ts-ignore
        app.use(bodyParser.json())
        app.use(promiseMiddleware())

        const registerRoutes = async (name: string) => {
            const module = await import(name)
            await module.register(app)
        }

        // message_route(app)
        // await registerRoutes("@/yoda/api/chat/route")
        // await registerRoutes("@/yoda/api/chat/[id]/route")
        // await registerRoutes("@/yoda/api/chat/[id]/message/[messageId]/route")
        // await registerRoutes("@/yoda/api/chat/[id]/[conversationId]/debug/route")
        //
        // await registerRoutes("@/yoda/api/product/route")
        // await registerRoutes("@/yoda/api/product/[id]/fact/route")
        // await registerRoutes("@/yoda/api/product/[id]/fact/[factId]/route")
        //
        // await registerRoutes("@/yoda/api/graph/route")

        await registerRoutes("@/yoda/api/agent/route")
        await registerRoutes("@/yoda/api/agent/[id]/route")
        await registerRoutes("@/yoda/api/agent/[id]/conversation/route")
        await registerRoutes("@/yoda/api/agent/[id]/conversation/[conversationId]/route")
        await registerRoutes("@/yoda/api/agent/[id]/conversation/[conversationId]/chain/route")

        app.get('/', (req: Request, res: Response) => {
            res.send('Welcome to Express & TypeScript Server');
        });

        app.use(handler)

        // @ts-ignore
        const server = createServer(app)

        const wss = new WebSocketServer({server});
        /*
        server.on('upgrade', function (request, socket, head) {
          wss.handleUpgrade(request, socket, head, function (ws) {
          console.log("Got upgrade")
            wss.emit('connection', ws, request);
          })
        })
        */

        // map of chatId -> {id: socket}
        const debugMap: Record<string, Record<string, MessageOperator>> = {}

        const fireEvent = (chatId: string, event: YodaEvent) => {
            if (debugMap[chatId]) {
                Object.values(debugMap[chatId]).forEach(op => op.fireEvent(event))
            }
        }

        interface SocketMessage {
            command: string

            magicKey: string
            filter: string[]
        }

        class MessageOperator {
            private ws: WebSocket
            private eventSelectors: WCMatch[] = []

            constructor(ws: WebSocket) {
                this.ws = ws;
            }

            handleMessage(message: SocketMessage) {
                switch (message.command) {
                    case "setFilter":
                        const filters = message.filter as string[]
                        this.eventSelectors = filters.map(selector => createIdPatternMatcher(selector))
                        return true;
                    default:
                        return false
                }
            }

            fireEvent(event: YodaEvent) {
                if (this.eventSelectors.some(matcher => matcher(event.id + ":" + event.eventName))) {
                    const message = {
                        id: event.id,
                        date: event.timeStamp,
                        eventName: event.eventName,
                        args: event.args
                    }
                    this.ws.send(JSON.stringify(message))
                }
            }
        }

        wss.on('connection', function (ws, _request) {
            let magicKey: string | null = null
            let chatId: string | null
            ws.on('error', console.error);

            ws.on("message", (s: RawData) => {
                try {
                    const messageJson = JSON.parse(s.toString('utf-8'))
                    if (messageJson.command == "init") {
                        magicKey = nanoid()
                        chatId = messageJson.chatId as string
                        if (!Object.hasOwn(debugMap, chatId)) {
                            debugMap[chatId] = {}
                        }
                        debugMap[chatId][magicKey] = new MessageOperator(ws)
                    } else if (chatId && magicKey && Object.hasOwn(debugMap, chatId) && Object.hasOwn(debugMap[chatId], magicKey)) {
                        debugMap[chatId][magicKey].handleMessage(messageJson as SocketMessage)
                    } else {
                        console.error("Invalid message ", messageJson, debugMap)
                    }
                } catch (e) {
                    console.error("Error processing message ", e)
                }
            })

            ws.on('close', function () {
                console.log("Got close???")
                if (magicKey && chatId) {
                    delete debugMap[chatId][magicKey]
                    if (!debugMap[chatId]) {
                        delete debugMap[chatId]
                    }
                }
            })
        })

        this.server = server
    }

    start() {
        const port = process.env.PORT || 8000;
        this.server!.listen(port, () => {
            console.log(`Server is Fire at http://localhost:${port}`);
        });
    }
}
