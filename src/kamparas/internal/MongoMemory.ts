import {AgentMemory, EpisodicEvent, ProceduralEvent, SemanticMemory} from "@/kamparas/Memory";
import {AgentIdentifier} from "@/kamparas/Agent";
import {mongoCollection} from "@/util/util";
import {DateTime} from "luxon";
import {ObjectId} from "mongodb";
import {PromptTemplate} from "langchain";

export class MongoMemory extends AgentMemory {
    private agentIdentifier: AgentIdentifier;

    constructor(agentIdentifier: AgentIdentifier) {
        super();
        this.agentIdentifier = agentIdentifier;
    }

    async readEpisodicEventsForTask(task_id: string): Promise<EpisodicEvent[]> {
        const collection = await mongoCollection(this.makeCollectionName("episodic"))
        return collection.find<EpisodicEvent>({task_id: task_id}).toArray()
    }

    async recordPlan(template: string): Promise<void> {
        const collection = await mongoCollection(this.makeCollectionName("plan"))
        const timestamp = DateTime.now().toISO()!
        return collection.insertOne({type: "plan", template: template, timestamp: timestamp}).then()
    }

    async recordPlanInstructions(template: string): Promise<void> {
        const collection = await mongoCollection(this.makeCollectionName("plan"))
        const timestamp = DateTime.now().toISO()!
        return collection.insertOne({type: "instructions", template: template, timestamp: timestamp}).then()
    }

    async readPlan(input: Record<string, any>, planId?: string): Promise<string> {
        const find: Record<string, any> = {
            type: "plan"
        }
        if (planId) {
            find['_id'] = ObjectId.createFromBase64(planId)
        }
        const collection = await mongoCollection(this.makeCollectionName("plan"))
        const template = await collection.findOne(find).then(d => d?.template)
        if (!template) {
            return Promise.reject("WTH!!! -- could not find " + this.makeCollectionName("plan") + "--" + JSON.stringify(find))
        }

        return PromptTemplate.fromTemplate(template).format(input);
    }

    async readPlanInstructions(input: Record<string, any>, planId?: string): Promise<string> {
        const find: Record<string, any> = {
            type: "instructions"
        }
        if (planId) {
            find['_id'] = ObjectId.createFromBase64(planId)
        }
        const collection = await mongoCollection(this.makeCollectionName("plan"))
        const template = await collection.findOne(find).then(d => d?.template)
        if (!template) {
            return Promise.reject("WTH!!! -- could not find " + this.makeCollectionName("plan") + "--" + JSON.stringify(find))
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

    private makeCollectionName(memoryType: ("episodic" | "semantic" | "procedure" | "plan")) {
        return this.agentIdentifier.identifier + "_" + this.agentIdentifier.title + memoryType
    }
}