// @ts-ignore
import {createIdPatternMatcher, EventHandler, WCMatch, YodaEvent} from "@/util/llm/EventHandler";
import {fireEvent} from "@/yoda/YodaServer";

export class APIListener implements EventHandler {
  private readonly chatId: string

  constructor(chatId: string) {
    this.chatId = chatId;
  }

  handleEvent(event: YodaEvent): void {
    fireEvent(this.chatId, event)
  }
}
