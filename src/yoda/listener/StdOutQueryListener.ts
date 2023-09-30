import process from "process";
import {createIdPatternMatcher, EventHandler, WCMatch, YodaEvent} from "@/util/llm/EventHandler";

export class StdOutQueryListener implements EventHandler {
  numTokensUsed: number = 0
  private readonly eventSelectors: WCMatch[]
  private readonly matchesLLMEnd = createIdPatternMatcher("**:onAfterExecLLM") || createIdPatternMatcher("**:onAfterExecAgent")

  constructor(...eventSelectors: string[]) {
    this.eventSelectors = eventSelectors.map(selector => createIdPatternMatcher(selector))
  }

  matchesSelectors(id: string): boolean {
    return this.eventSelectors.some(selector => {
      return selector(id)
    })
  }

  handleEvent(event: YodaEvent): void {
    if (this.matchesLLMEnd(event.id)) {
      this.numTokensUsed += (event.args[0].llmOutput as any).tokenUsage.totalTokens
    }
    if (this.matchesSelectors(event.id)) {
      const indent = event.id.replaceAll(/[^:]*/g, "").length * 2
      process.stdout.write(`${event.timeStamp.toISOTime()}-${" ".repeat(indent)}${event.id}:${event.eventName}-${JSON.stringify(event.args)}\n`)
    }
  }
}
