import {AgentMemory, EpisodicEvent, ProceduralEvent, SemanticMemory} from "@/kamparas/Memory";
import {AgentIdentifier} from "@/kamparas/Agent";
import {mongoCollection} from "@/util/util";
import {DateTime} from "luxon";
import {FindOptions, ObjectId} from "mongodb";
import {PromptTemplate} from "langchain";
import dotenv from "dotenv";

// todo collections will need index on agent_id and task_id
export class MongoMemory extends AgentMemory {
    private agentIdentifier: AgentIdentifier;

    constructor(agentIdentifier: AgentIdentifier) {
        super();
        dotenv.config()
        this.agentIdentifier = agentIdentifier;
    }

    async readEpisodicEventsForTask(task_id: string, limit?: number): Promise<EpisodicEvent[]> {
        const collection = await mongoCollection(this.makeCollectionName("episodic"))
        let options = {sort: {"timestamp": 1}} as FindOptions;
        if (limit !== undefined) {
            options["limit"] = limit
        }
        return collection.find<EpisodicEvent>({
            agent_id: this.agentIdentifier.identifier,
            task_id: task_id
        }, options).toArray()
    }

    async recordPlan(template: string): Promise<void> {
        const collection = await mongoCollection("plans")
        const timestamp = DateTime.now().toISO()!
        return collection.insertOne({
            type: "plan",
            agent_title: this.agentIdentifier.title,
            agent_id: this.agentIdentifier.identifier,
            template: template,
            timestamp: timestamp}
        ).then()
    }

    async recordPlanInstructions(template: string): Promise<void> {
        const collection = await mongoCollection("plans")
        const timestamp = DateTime.now().toISO()!
        return collection.insertOne({
            type: "instructions",
            agent_title: this.agentIdentifier.title,
            agent_id: this.agentIdentifier.identifier,
            template: template,
            timestamp: timestamp
        }).then()
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

        return PromptTemplate.fromTemplate(template).format(input);
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

        return PromptTemplate.fromTemplate(template).format(input);
    }

    async recordEpisodicEvent(event: EpisodicEvent): Promise<void> {
        const collection = await mongoCollection(this.makeCollectionName("episodic"))
        return collection.insertOne(event).then(res => {})
    }

    async recordProceduralEvent(event: ProceduralEvent): Promise<void> {
        const collection = await mongoCollection(this.makeCollectionName("procedure"))
        return collection.insertOne(event).then(res => {})
    }

    async recordSemanticMemory(event: SemanticMemory): Promise<void> {
        const collection = await mongoCollection(this.makeCollectionName("semantic"))
        return collection.insertOne(event).then(res => {
        })
    }

    private makeCollectionName(memoryType: ("episodic" | "semantic" | "procedure")) {
        return memoryType + "_" + this.agentIdentifier.title
    }
}