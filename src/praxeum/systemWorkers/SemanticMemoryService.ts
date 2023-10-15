import {MongoMemory} from "@/kamparas/internal/MongoMemory";
import {Agent, AgentIdentifier, AgentOptions} from "@/kamparas/Agent";
import {typeRoleMap} from "@/kamparas/internal/OpenAILLM";
import YAML from "yaml";
import {DirectMessage, RabbitAgentEnvironment} from "@/kamparas/internal/RabbitAgentEnvironment";
import {EventContent, HelpResponse, NewTaskInstruction} from "@/kamparas/Environment";
import {nanoid} from "nanoid";
import {SemanticMemoryClient} from "@/kamparas/internal/SemanticMemoryClient";
import {getOrCreateSchemaManager} from "@/kamparas/SchemaManager";
import {z} from "zod";

// todo: This might be a nicer interface if we decide to implement serves via agents.
// todo: It can become stateless pretty easily by throwing transient memory in mongo.
abstract class ServiceAgent extends Agent {
    private ongoingRequests

    constructor(options: AgentOptions) {
        super(options)
        this.ongoingRequests = new Map<string, (value: any) => void>();
    }

    async askForHelp(conversationId: string, title: string, content: EventContent){
        let requestId = nanoid();
        const p = new Promise<any>((resolve) => {
            this.ongoingRequests.set(requestId, resolve)
        });
        await this.environment.askForHelp(this.title, this.identifier, conversationId, title, requestId, content)
        p.finally(() => {
            this.ongoingRequests.delete(requestId)
        })
        return p
    }

    async processDirectMessage(response: DirectMessage): Promise<void> {
        if (response.type == "manager_call") {
            this.logger.warn("Service received unexpected manager call. Ignoring")
        } else {
            let contents = response.contents as HelpResponse;
            let found = this.ongoingRequests.get(contents.request_id);
            if (!found) {
                this.logger.error(`Received unknown requestId: ${contents.request_id}`, response)
            } else {
                found(contents)
            }
        }
    }
}

export class SemanticMemoryService extends ServiceAgent {
    static inputZod =  z.object({
        agent_type: z.string(),
        agent_id: z.string(),
        conversation_id: z.string(),
    })
    static outputZod =  z.object({})

    constructor(identifier: string, environment: RabbitAgentEnvironment) {
        super({
            title: "SemanticMemoryService",
            job_description: "Creates semantic memories from episodic ones",
            identifier: identifier,
            input_schema: getOrCreateSchemaManager().compileZod(SemanticMemoryService.inputZod),
            answer_schema: getOrCreateSchemaManager().compileZod(SemanticMemoryService.outputZod),
            environment: environment,
        });
    }

    async processInstruction(instruction: NewTaskInstruction): Promise<void> {
        const conversationId = nanoid()

        // information from agent who's episodic memories are being processed
        const _agentType = instruction.input.agent_type
        const _agentId = instruction.input.agent_id
        const _conversationId = instruction.input.conversation_id

        const sm = await new SemanticMemoryClient(_agentId).initialize() //todo, this is wrong
        const mm = new MongoMemory({title: _agentType, identifier: _agentId} as AgentIdentifier)
        let events = await mm.readEpisodicEventsForTask(_conversationId);
        const eventsStr = events.map((e, index) => {
            return {
                event_id: index,
                role: typeRoleMap[e.type],
                content: e.content,
            }
        }).map(o => YAML.stringify(o))

        const found = await this.askForHelp(conversationId, 'semantic_memory_creator', {
            number_of_insights: 2,
            events: eventsStr,
        })

        found.insights.forEach((insight: any) => {
            sm.recordSemanticMemory({
                type: "insight",
                agent_title: _agentType,
                agent_id: _agentId,
                conversation_id: _conversationId,
                summary: insight.summary,
                events: insight.events,
                importance: insight.importance,
            })
        })
    }
}
