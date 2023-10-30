import {AgentMemory, EpisodicEvent, ProceduralEvent, SemanticMemory} from "@/kamparas/Memory";
import {AgentIdentifier} from "@/kamparas/Agent";
import {mongoCollection} from "@/util/util";
import {DateTime} from "luxon";
import {FindOptions, ObjectId} from "mongodb";
import dotenv from "dotenv";
import {TemplateProcessor} from "@/util/TemplateProcessor"
import {SemanticMemoryClient, SemanticWrapper} from "@/kamparas/internal/SemanticMemoryClient"
import {ChromaSemanticMemoryClient} from "@/kamparas/internal/ChromaSemanticMemoryClient";
import {Observation} from "@/praxeum/systemWorkers/CreateObservation";

// todo collections will need index on agent_id and conversation_id
export class MongoMemory extends AgentMemory {
    private agentIdentifier: AgentIdentifier;
    private semanticMemory?: SemanticMemoryClient

    constructor(agentIdentifier: AgentIdentifier) {
        super();
        dotenv.config()
        this.agentIdentifier = agentIdentifier;
        this.semanticMemory = process.env.ENABLE_SEMANTIC_MEMORIES === "true" ? new ChromaSemanticMemoryClient(agentIdentifier) : undefined
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
            agent_id: this.agentIdentifier.identifier,
            archive_time: { "$exists": false}
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
            agent_id: this.agentIdentifier.identifier,
            archive_time: { "$exists": false}
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

    searchSemanticMemory(query: string, size: number): Promise<SemanticWrapper[]> {
        return this.semanticMemory!.searchSemanticMemory(query, size)
    }

    async recordSemanticMemory(event: Omit<SemanticMemory, "agent_title" | "agent_id">): Promise<void> {
        return await this.semanticMemory!.recordSemanticMemory({
            ...event,
            agent_title: this.agentIdentifier.title,
            agent_id: this.agentIdentifier.identifier
        })
    }

    async recordCreateObservation(agent_title: string, agent_id: string, conversation_id: string, root_observation_id: string, observationId: string, observation: string): Promise<void> {
        const collection = await mongoCollection("observation")
        await collection.insertOne({
            type: "observation",
            agent_title: agent_title,
            agent_id: agent_id,
            conversation_id: conversation_id,
            root_observation_id: root_observation_id,
            observation_or_thought: observation,
            observation_id: observationId
        } as Observation)
    }

    async recordObservationAnswer(agent_title: string, agent_id: string, conversation_id: string, observation_id: string, thought: string): Promise<void> {
        const collection = await mongoCollection("observation")
        const observation = await collection.findOne<Observation>({type: "observation", observation_id: observation_id})
        if (!observation) {
            this.logger.warn(`Could not find observation ${observation_id}. Did you provide the correct value?`)
        }
        await collection.insertOne({
            type: "answer",
            agent_title: agent_title,
            agent_id: agent_id,
            conversation_id: conversation_id,
            root_observation_id: observation?.root_observation_id || "root",
            observation_id: observation_id,
            observation_or_thought: thought
        } as Observation)
    }

    async recordThought(agent_title: string, agent_id: string, conversation_id: string, observation_id: string, thought: string): Promise<void> {
        const collection = await mongoCollection("observation")
        const observation = await collection.findOne<Observation>({type: "observation", observation_id: observation_id})
        if (!observation) {
            throw `Could not find observation ${observation_id}. Did you provide the correct value?`
        }
        await collection.insertOne({
            type: "thought",
            agent_title: agent_title,
            agent_id: agent_id,
            conversation_id: conversation_id,
            root_observation_id: observation.root_observation_id,
            observation_id: observation_id,
            observation_or_thought: thought
        } as Observation)
    }

    private makeCollectionName(memoryType: ("episodic" | "semantic" | "procedure")) {
        return memoryType
    }
}
