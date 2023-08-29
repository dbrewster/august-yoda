import express, {Application, Request, Response} from 'express';
import dotenv from 'dotenv';

import bodyParser from "body-parser";
import {createServer} from "http";
import {RawData, WebSocket, WebSocketServer} from "ws";
import message_route from "@/yoda/api/chat/[id]/message/route.js"
import {nanoid} from "nanoid";
import {createIdPatternMatcher, WCMatch, YodaEvent} from "@/yoda/listener/EventHandler.js";

//For env File
dotenv.config();

const app: Application = express();
app.use(bodyParser.json())
const port = process.env.PORT || 8000;

const registerRoutes = async (name: string) => {
  const module = await import(name)
  await module.register(app)
}

message_route(app)

await registerRoutes("@/yoda/api/chat/route.js")
await registerRoutes("@/yoda/api/chat/[id]/route.js")
await registerRoutes("@/yoda/api/chat/[id]/message/[messageId]/route.js")
await registerRoutes("@/yoda/api/chat/[id]/[conversationId]/debug/route.js")

await registerRoutes("@/yoda/api/product/route.js")
await registerRoutes("@/yoda/api/product/[id]/fact/route.js")
await registerRoutes("@/yoda/api/product/[id]/fact/[factId]/route.js")

app.get('/', (req: Request, res: Response) => {
  res.send('Welcome to Express & TypeScript Server');
});

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
export const debugMap: Record<string, Record<string, MessageOperator>> = {}

export const fireEvent = (chatId: string, event: YodaEvent) => {
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
  console.log("Got open")

  let magicKey: string | null = null
  let chatId: string | null
  ws.on('error', console.error);

  ws.on("message", (s: RawData) => {
    try {
      const messageJson = JSON.parse(s.toString('utf-8'))
      console.log("message", messageJson)
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

server.listen(port, () => {
  console.log(`Server is Fire at http://localhost:${port}`);
});
