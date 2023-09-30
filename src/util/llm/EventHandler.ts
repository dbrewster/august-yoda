// @ts-ignore
import wcmatch2 from 'wildcard-match'
import {DateTime} from "luxon";

export interface WCMatch {
    (sample: string): boolean;
}

export const createIdPatternMatcher = (pattern: string): WCMatch => {
  return wcmatch2(pattern, {separator:":"})
}

export interface YodaEvent {
  id: string,
  timeStamp: DateTime,
  eventName: string,
  args: Record<string, any>
}

export interface EventHandler {
  handleEvent(event: YodaEvent): void
}
