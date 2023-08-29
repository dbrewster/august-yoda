import {EventHandler, YodaEvent} from "@/yoda/listener/EventHandler.js";

export abstract class BufferedEventHandler implements EventHandler {
  private events: YodaEvent[] = []
  private readonly _bufferSize: number;

  constructor(bufferSize: number = 25) {
    this._bufferSize = bufferSize;
  }

  handleEvent(event: YodaEvent): void {
    this.events = this.events.concat(event)
    if (this.events.length > this._bufferSize) {
      this.writeEvents(this.events)
      this.events = []
    }
  }

  flush(): void {
    if (this.events.length > 0) {
      this.writeEvents(this.events)
      this.events = []
    }
  }

  abstract writeEvents(events: YodaEvent[]): void
}