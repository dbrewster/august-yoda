import {MongoMemory} from "@/kamparas/internal/MongoMemory";
import {AgentIdentifier, BuiltinAgent} from "@/kamparas/Agent";
import {typeRoleMap} from "@/kamparas/internal/OpenAILLM";
import YAML from "yaml";
import {SemanticMemoryClient} from "@/kamparas/internal/SemanticMemoryClient";
import {SemanticMemory, StructuredEpisodicEvent} from "@/kamparas/Memory";
import {nanoid} from "nanoid";

// todo: This might be a nicer interface if we decide to implement serves via agents.
// todo: It can become stateless pretty easily by throwing transient memory in mongo.

interface SemanticMemoryBuilderArgs{
    agent_type: string
    agent_id: string
    conversation_id: string
    dry_run: boolean | undefined
}

export module SemanticMemoryService {
    export async function buildMemory(args: SemanticMemoryBuilderArgs, agent: BuiltinAgent) {
        // Memory clients should be accessed via DI
        const sm = await new SemanticMemoryClient(args.agent_id, false, agent.logger).initialize()
        const mm = new MongoMemory({title: args.agent_type, identifier: args.agent_id} as AgentIdentifier)
        const events = (await mm.readEpisodicEventsForTask(args.conversation_id));
        const otherEvents = events.filter(e => e.type !== "task_start")

        // todo, we should remember tool calls as well, but for now just assistant events
        const splitSize = 12000
        let reducedFieldsEvent = otherEvents.map((event, index) => {
            return {event_id: index, role: typeRoleMap[event.type], content: event.content}
        });
        let chunkedEvents = reducedFieldsEvent.reduce((acc: {chunks: Array<any[]>, lastSize: number}, event) => {
            if (acc.lastSize > splitSize) {
                acc.chunks.push([])
                acc.lastSize = 0
            } else {
                acc.lastSize += YAML.stringify(event).length
            }
            acc.chunks.at(-1)!.push(event)
            return acc
        }, {chunks: [[]], lastSize: 0}).chunks;

        let insights: any[] = []
        for (let chunk in chunkedEvents) {
            let content = {number_of_insights: 2, events: chunk};
            const resp = await agent.askForHelp(nanoid(), 'MemoryReflector', content) as any;
            insights = insights.concat(resp.insights)
        }

        const memories = []
        for (var event of otherEvents) {
            let content1 = {memory: YAML.stringify(event.content)};
            const resp = await agent.askForHelp<any>(args.conversation_id, 'ImportanceRater', content1);
            memories.push({type: "event", memory: event, importance: resp.importance})
        }
        for (var insight of insights) {
            let content1 = {memory: YAML.stringify(insight)};
            const resp = await agent.askForHelp<any>(args.conversation_id, 'ImportanceRater', content1);
            memories.push({type: "reflection", memory: insight, importance: resp.importance})
        }
        const taskStartArgs = (events.find(e => e.type === "task_start")!.content as StructuredEpisodicEvent).input
        const semanticMemories: Omit<SemanticMemory, "timestamp">[] = memories.map(m => {
            return {
                ...m,
                agent_title:
                args.agent_type,
                agent_id: args.agent_id,
                data: {input: taskStartArgs},
                conversation_id: args.conversation_id,
            } as Omit<SemanticMemory, "timestamp">
        })

        if (!args.dry_run) {
            agent.logger.info("Saving semantic memories")
            await sm.recordSemanticMemories(semanticMemories)
        } else {
            agent.logger.info("Done building semantic memories, dry_run=true")
        }

        return {memories: semanticMemories}
    }
}
