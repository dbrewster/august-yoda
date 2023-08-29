// @ts-ignore
import {createIdPatternMatcher, EventHandler, WCMatch, YodaEvent} from "@/yoda/listener/EventHandler.js";
import {fireEvent} from "@/yoda/index.js";

export class APIListener implements EventHandler {
  private readonly chatId: string

  constructor(chatId: string) {
    this.chatId = chatId;
  }

  handleEvent(event: YodaEvent): void {
    fireEvent(this.chatId, event)
  }
}
