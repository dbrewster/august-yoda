import {AgentIdentifier} from "@/kamparas/Agent";
import {allToolIdentifiers} from "@/praxeum/SingleNodeDeployment";

export module DeploymentTools {
    export interface FindRelevantToolsIn {
        tool_description: string
    }
    export const findRelevantTools = (question: FindRelevantToolsIn): Record<"tools", AgentIdentifier[]> => {
        return {
            tools: Object.values(allToolIdentifiers).map(x => x.identifier)
        }
    }
}
