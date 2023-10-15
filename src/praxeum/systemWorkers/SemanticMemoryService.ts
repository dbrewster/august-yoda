import {MongoMemory} from "@/kamparas/internal/MongoMemory";
import {AgentIdentifier, BuiltinAgent} from "@/kamparas/Agent";
import {typeRoleMap} from "@/kamparas/internal/OpenAILLM";
import YAML from "yaml";
import {EventContent} from "@/kamparas/Environment";
import {SemanticMemoryClient} from "@/kamparas/internal/SemanticMemoryClient";

// todo: This might be a nicer interface if we decide to implement serves via agents.
// todo: It can become stateless pretty easily by throwing transient memory in mongo.

interface SemanticMemoryBuilderArgs{
    agent_type: string
    agent_id: string
    conversation_id: string
}

export module SemanticMemoryService {
    export async function buildMemory(args: SemanticMemoryBuilderArgs, agent: BuiltinAgent) {
        // Memory clients should be accessed via DI
        const sm = await new SemanticMemoryClient(args.agent_id, false, agent.logger).initialize()
        const mm = new MongoMemory({title: args.agent_type, identifier: args.agent_id} as AgentIdentifier)
        let events = await mm.readEpisodicEventsForTask(args.conversation_id);
        const eventsStr: string = YAML.stringify(events.map((e, index) => {
            return {
                event_id: index,
                role: typeRoleMap[e.type],
                content: e.content,
            }
        }))

        const found = await agent.askForHelp<EventContent>(args.conversation_id, 'memory_reflector', {
            number_of_insights: 2,
            events: eventsStr,
        }).promise

        found.insights.forEach((insight: any) => {
            sm.recordSemanticMemory({
                type: "insight",
                agent_title: args.agent_type,
                agent_id: args.agent_id,
                conversation_id: args.conversation_id,
                summary: insight.summary,
                events: insight.events,
                importance: insight.importance,
            })
        })
    }
}
