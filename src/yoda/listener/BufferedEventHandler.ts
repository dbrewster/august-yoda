import {EventHandler, YodaEvent} from "@/yoda/listener/EventHandler.js";

export abstract class BufferedEventHandler implements EventHandler {
  private events: YodaEvent[] = []
  private readonly _bufferSize: number;

  constructor(bufferSize: number = 25) {
    this._bufferSize = bufferSize;
  }

  handleEvent(event: YodaEvent): void {
    this.events = this.events.concat(event)
    this.flush()
  }

  flush(): void {
    if (this.events.length > 0) {
      const eventsCopy = this.events
      this.events = []
      this.writeEvents(eventsCopy)
    }
  }

  abstract writeEvents(events: YodaEvent[]): Promise<void>
}