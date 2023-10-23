import {AgentIdentifier} from "@/kamparas/Agent";

const identifiers: Record<string, AgentIdentifier> = {}

export namespace AgentRegistry {
    export function getAgentsKeys() {
        return Object.keys(identifiers)
    }

    export function getAgents() {
        return Object.values(identifiers)
    }

    export function getIdentifier(title: string): AgentIdentifier {
        return identifiers[title]
    }

    export function registerIdentifier(identifier: AgentIdentifier) {
        identifiers[identifier.title] = identifier
    }

    export function deleteIdentifier(title: string) {
        delete identifiers[title]
    }
}