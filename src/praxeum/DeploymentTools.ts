import {AgentIdentifier} from "@/kamparas/Agent";
import {getSingleNodeDeployment} from "@/praxeum/SingleNodeDeployment";

export module DeploymentTools {
    export interface FindRelevantToolsIn {
        tool_description: string
    }
    export const findRelevantTools = (question: FindRelevantToolsIn): Record<"tools", AgentIdentifier[]> => {
        return {
            tools: Object.values(getSingleNodeDeployment().allInstances).map(x => x.identifier)
        }
    }
}
