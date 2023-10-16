import {AgentIdentifier} from "@/kamparas/Agent";

const identifiers: Record<string, AgentIdentifier> = {}

export function getIdentifier(title: string): AgentIdentifier {
    return identifiers[title]
}

export function registerIdentifier(identifier: AgentIdentifier) {
    identifiers[identifier.title] = identifier
}

export function deleteIdentifier(title: string) {
    delete identifiers[title]
}
