import {MongoMemory} from "@/kamparas/internal/MongoMemory";
import {AgentIdentifier} from "@/kamparas/Agent";
import {typeRoleMap} from "@/kamparas/internal/OpenAILLM";
import YAML from "yaml";
import {MongoSemanticMemoryClient} from "@/kamparas/internal/SemanticMemoryClient";
import {CodeAgent, CodeAgentOptions} from "@/kamparas/CodeAgent";
import {SemanticMemory, StructuredEpisodicEvent} from "@/kamparas/Memory";
import {nanoid} from "nanoid";
import {getOrCreateSchemaManager} from "@/kamparas/SchemaManager"
import {z} from "zod"
import {EventContent, HelpResponse, NewTaskInstruction} from "@/kamparas/Environment"
import {Deferred, getDeferred} from "@/util/util"


interface SemanticMemoryBuilderArgs {
    agent_type: string
    agent_id: string
    conversation_id: string
    dry_run: boolean | undefined
}

// noinspection JSUnusedGlobalSymbols
export class BuildMemoryAgent extends CodeAgent {
    requestIdToDeferred: Record<string, Deferred<any>> = {}

    constructor(options: CodeAgentOptions) {
        super({
            ...options,
            identifier: "alpha",
            job_description: "",
            input_schema: getOrCreateSchemaManager().compileZod(z.object({
                agent_type: z.string().describe(""),
                agent_id: z.string().describe(""),
                conversation_id: z.string().describe(""),
                dry_run: z.boolean().describe(""),
            })),
            answer_schema: getOrCreateSchemaManager().compileZod(z.object({
                type: z.string().describe(""),
                agent_title: z.string().describe(""),
                agent_id: z.string().describe(""),
                conversation_id: z.string().describe(""),
                data: z.object({}),
                memory: z.object({}),
                importance: z.number().describe(""),
            }))
        })
    }

    promisedBasedHelp(conversationId: string, agentTitle: string, content: EventContent): Promise<any> {
        const requestId: string = nanoid()
        this.requestIdToDeferred[requestId] = getDeferred()
        // noinspection JSIgnoredPromiseFromCall
        super.askForHelp(conversationId, agentTitle, this.getTaskContext(conversationId), content, undefined, requestId)

        return this.requestIdToDeferred[requestId].promise
    }

    async exec(instruction: NewTaskInstruction, conversationId: string): Promise<void> {
        const response = await this.buildMemory(instruction.input as SemanticMemoryBuilderArgs, conversationId)
        // noinspection ES6MissingAwait
        this.doAnswer(conversationId, instruction.request_id, response)
        return Promise.resolve(undefined)
    }

    async processHelpResponse(response: HelpResponse, callContext: any): Promise<void> {
        const deferred = this.requestIdToDeferred[response.request_id]
        if (!deferred) {
            this.logger.error(`Could not find request_id (${response.request_id}) in response!`)
        } else {
            if (response.status === "failure") {
                deferred.reject(response.response)
            } else {
                deferred.resolve(response.response)
            }
        }
    }

    async buildMemory(args: SemanticMemoryBuilderArgs, conversation_id: string) {
        // Memory clients should be accessed via DI
        const sm = await new MongoSemanticMemoryClient(args.agent_id, this.logger).initialize()
        const mm = new MongoMemory({title: args.agent_type, identifier: args.agent_id} as AgentIdentifier)
        const events = (await mm.readEpisodicEventsForTask(args.conversation_id));
        if (events.length === 0) {
            throw new Error(`Did not find any events`)
        }
        const otherEvents = events.filter(e => e.type !== "task_start")
        let taskStart = events.find(e => e.type === "task_start")!
        let instruction = events.find(e => e.type === "instruction")!

        // todo, we should remember tool calls as well, but for now just assistant events
        const splitSize = 12000
        let reducedFieldsEvent = otherEvents.map((event, index) => {
            return {event_id: index, role: typeRoleMap[event.type], content: event.content}
        });
        let chunkedEvents = reducedFieldsEvent.reduce((acc: { chunks: Array<any[]>, lastSize: number }, event) => {
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
        for (let chunk of chunkedEvents) {
            let content = {number_of_insights: 2, events: JSON.stringify(chunk)};
            const resp = await this.promisedBasedHelp(conversation_id, 'MemoryReflector', content) as any;
            insights = insights.concat(resp.insights)
        }

        const memories = []
        for (var event of otherEvents) {
            let content1 = {context: JSON.stringify(instruction.content), memory: JSON.stringify(event.content)};
            const resp = await this.promisedBasedHelp(args.conversation_id, 'ImportanceRater', content1);
            memories.push({type: "event", memory: event, importance: resp.importance})
        }
        for (var insight of insights) {
            let content1 = {context: JSON.stringify(instruction.content), memory: insight.description};
            const resp = await this.promisedBasedHelp(args.conversation_id, 'ImportanceRater', content1);
            memories.push({type: "reflection", memory: insight.description, importance: resp.importance})
        }
        const taskStartArgs = (taskStart.content as StructuredEpisodicEvent).input
        const semanticMemories: Omit<SemanticMemory, "timestamp" | "semantic_string">[] = memories.map(m => {
            return {
                ...m,
                agent_title: args.agent_type,
                agent_id: args.agent_id,
                conversation_id: args.conversation_id,
            } as Omit<SemanticMemory, "timestamp">
        })

        if (!args.dry_run) {
            this.logger.info("Saving semantic memories")
            await sm.recordSemanticMemories(YAML.stringify(taskStartArgs), semanticMemories)
        } else {
            this.logger.info("Done building semantic memories, dry_run=true")
        }

        return {memories: semanticMemories}
    }
}
