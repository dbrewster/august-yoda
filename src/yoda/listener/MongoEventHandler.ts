import {YodaEvent} from "@/yoda/listener/EventHandler.js";
import {mongoCollection} from "@/yoda/api/util.js";
import {BufferedEventHandler} from "@/yoda/listener/BufferedEventHandler.js";

export class MongoEventHandler extends BufferedEventHandler {
  private readonly userId: string
  private readonly chatId: string
  private _conversationId: string;

  constructor(userId: string, chatId: string, conversationId: string) {
    super()
    this.userId = userId;
    this.chatId = chatId;
    this._conversationId = conversationId;
  }

  writeEvents(events: YodaEvent[]): void {
    const writeEvents = events.map(e => ({...e, userId: this.userId, chatId: this.chatId, conversationId: this._conversationId, id: e.id + ":" + e.eventName}))
    mongoCollection("chat_debug").then(collection => {
      collection.insertMany(writeEvents)
    })
  }
}
