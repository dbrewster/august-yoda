import {AgentMemory, EpisodicEvent, ProceduralEvent, SemanticMemory} from "@/kamparas/Memory";
import {AgentIdentifier} from "@/kamparas/Agent";
import {mongoCollection} from "@/util/util";
import {DateTime} from "luxon";
import {FindOptions, ObjectId} from "mongodb";
import dotenv from "dotenv";
import {TemplateProcessor} from "@/util/TemplateProcessor"

// todo collections will need index on agent_id and conversation_id
export class MongoMemory extends AgentMemory {
    private agentIdentifier: AgentIdentifier;

    constructor(agentIdentifier: AgentIdentifier) {
        super();
        dotenv.config()
        this.agentIdentifier = agentIdentifier;
    }

    async findEpisodicEvent(query: Record<string, any>): Promise<EpisodicEvent | null> {
        const collection = await mongoCollection(this.makeCollectionName("episodic"))
        return await collection.findOne<EpisodicEvent>(query)
    }

    async readEpisodicEventsForTask(conversation_id: string, limit?: number): Promise<EpisodicEvent[]> {
        const collection = await mongoCollection(this.makeCollectionName("episodic"))
        let options = {sort: {"timestamp": 1}} as FindOptions;
        if (limit !== undefined) {
            options["limit"] = limit
        }
        return collection.find<EpisodicEvent>({
            agent_id: this.agentIdentifier.identifier,
            conversation_id: conversation_id
        }, options).toArray()
    }

    async recordPlan(template: string): Promise<void> {
        const find: Record<string, any> = {
            type: "plan",
            agent_title: this.agentIdentifier.title,
            agent_id: this.agentIdentifier.identifier
        }
        const collection = await mongoCollection("plans")
        const timestamp = DateTime.now().toISO()!
        return collection.updateOne(find, {
                "$set": {
                    type: "plan",
                    agent_title: this.agentIdentifier.title,
                    agent_id: this.agentIdentifier.identifier,
                    template: template,
                    timestamp: timestamp
                }
            }, {
                upsert: true
            }
        ).then()
    }

    async recordPlanInstructions(template: string): Promise<void> {
        const find: Record<string, any> = {
            type: "instructions",
            agent_title: this.agentIdentifier.title,
            agent_id: this.agentIdentifier.identifier
        }
        const collection = await mongoCollection("plans")
        const timestamp = DateTime.now().toISO()!
        return collection.updateOne(find, {
            "$set": {
                type: "instructions",
                agent_title: this.agentIdentifier.title,
                agent_id: this.agentIdentifier.identifier,
                template: template,
                timestamp: timestamp
            }
        }, {upsert: true}).then()
    }

    async planExists(): Promise<boolean> {
        const find: Record<string, any> = {
            type: "plan",
            agent_title: this.agentIdentifier.title,
            agent_id: this.agentIdentifier.identifier
        }
        const collection = await mongoCollection("plans")
        return collection.findOne(find).then(d => d?.template).then(d => d)
    }

    async readPlan(input: Record<string, any>, planId?: string): Promise<string> {
        const find: Record<string, any> = {
            type: "plan",
            agent_title: this.agentIdentifier.title,
            agent_id: this.agentIdentifier.identifier
        }
        if (planId) {
            find['_id'] = ObjectId.createFromBase64(planId)
        }
        const collection = await mongoCollection("plans")
        const template = await collection.findOne(find).then(d => d?.template)
        if (!template) {
            return Promise.reject("WTH!!! -- could not find plan --" + JSON.stringify(find))
        }

        return TemplateProcessor.process(template, input)
    }

    async planInstructionsExists(): Promise<boolean> {
        const find: Record<string, any> = {
            type: "instructions",
            agent_title: this.agentIdentifier.title,
            agent_id: this.agentIdentifier.identifier
        }
        const collection = await mongoCollection("plans")
        return collection.findOne(find).then(d => d?.template).then(d => d)
    }

    async readPlanInstructions(input: Record<string, any>, planId?: string): Promise<string> {
        const find: Record<string, any> = {
            type: "instructions",
            agent_title: this.agentIdentifier.title,
            agent_id: this.agentIdentifier.identifier
        }
        if (planId) {
            find['_id'] = ObjectId.createFromBase64(planId)
        }
        const collection = await mongoCollection("plans")
        const template = await collection.findOne(find).then(d => d?.template)
        if (!template) {
            return Promise.reject("WTH!!! -- could not find plan instruction --" + JSON.stringify(find))
        }

        return TemplateProcessor.process(template, input);
    }

    async recordEpisodicEvent(event: Omit<EpisodicEvent, "agent_title" | "agent_id">): Promise<void> {
        const collection = await mongoCollection(this.makeCollectionName("episodic"))
        await collection.insertOne({
            ...event,
            agent_title: this.agentIdentifier.title,
            agent_id: this.agentIdentifier.identifier
        })
    }

    async recordProceduralEvent(event: Omit<ProceduralEvent, "agent_title" | "agent_id">): Promise<void> {
        const collection = await mongoCollection(this.makeCollectionName("procedure"))
        await collection.insertOne({
            ...event,
            agent_title: this.agentIdentifier.title,
            agent_id: this.agentIdentifier.identifier
        })
    }

    async recordSemanticMemory(event: Omit<SemanticMemory, "agent_type" | "agent_id">): Promise<void> {
        const collection = await mongoCollection(this.makeCollectionName("semantic"))
        await collection.insertOne({
            ...event,
            agent_title: this.agentIdentifier.title,
            agent_id: this.agentIdentifier.identifier
        })
    }

    private makeCollectionName(memoryType: ("episodic" | "semantic" | "procedure")) {
        return memoryType
    }
}
