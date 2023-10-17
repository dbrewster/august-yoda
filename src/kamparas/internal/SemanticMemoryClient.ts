import {rootLogger} from "@/util/RootLogger";
import {Logger} from "winston";
import process from "process";
import {SemanticMemory} from "@/kamparas/Memory";
import {DateTime} from "luxon";
import {mongoCollection} from "@/util/util"
import OpenAI from "openai"
import Embedding = OpenAI.Embedding


abstract class SemanticMemoryClient {
    private openai: OpenAI = new OpenAI({});
    protected logger: Logger

    protected constructor(logger?: Logger) {
        this.logger = logger || rootLogger;
    }

    abstract recordSemanticMemory(memory: Omit<SemanticMemory, "timestamp">): Promise<void>

    abstract recordSemanticMemories(semantic_string: string, memories: Omit<SemanticMemory, "timestamp" | "semantic_embedding" | "semantic_string">[]): Promise<void>

    abstract searchSemanticMemory(query: string, min_score: number, size: number): Promise<any>

    async getEmbeddings(semantic_string: string): Promise<number[]> {
        const response = await this.openai.embeddings.create({
            input: semantic_string, // @ts-ignore
            model: process.env.EMBEDDING_ALGORITHM
        })
        return response.data[0].embedding
    }
}

export class MongoSemanticMemoryClient extends SemanticMemoryClient {
    private readonly collection_name
    private readonly indexName = "semantic_search"

    constructor(agentId: string, logger?: Logger) {
        super(logger)
        this.collection_name = ("semantic_" + agentId).toLowerCase()
    }

    async initialize() {
        const collection = await mongoCollection<SemanticMemory>(this.collection_name)
        if ((await collection.listSearchIndexes().toArray()).map(o => o.name).indexOf(this.indexName) < 0) {
            await collection.createSearchIndex({
                name: this.indexName,
                definition: {
                    "mappings": {
                        "dynamic": true,
                        "fields": {
                            "semantic_embedding": {
                                "dimensions": 1536,  // this seems arbitrary
                                "similarity": "cosine",  //what alg?
                                "type": "knnVector"
                            }
                        }
                    }
                }
            })
        }
        return this
    }

    async recordSemanticMemory(memory: Omit<SemanticMemory, "timestamp">) {
        const collection = await mongoCollection(this.collection_name)
        // collection.createSearchIndex()  //todo handle embeddings index
        await collection.insertOne({
            ...memory,
            semantic_embedding: await this.getEmbeddings(memory.semantic_string),
            timestamp: DateTime.now().toISO()!,
        })
    }

    async recordSemanticMemories(semantic_string: string, memories: Omit<SemanticMemory, "timestamp" | "semantic_string">[]) {
        let semanticEmbedding = await this.getEmbeddings(semantic_string)
        const collection = await mongoCollection(this.collection_name)
        await collection.insertMany(memories.map(memory => { return {
            ...memory,
            semantic_string: semantic_string,
            semantic_embedding: semanticEmbedding,
            timestamp: DateTime.now().toISO()!,
        }}))
    }


    async searchSemanticMemory(query: string | Embedding[], min_score = .01, size = 1000) {
        const embeddings = typeof query === "string" ? await this.getEmbeddings(query) : query
        const collection = await mongoCollection<SemanticMemory>(this.collection_name)
        let documentAggregationCursor = collection.aggregate([{
            "$vectorSearch": {
                queryVector: embeddings,
                path: "semantic_embedding",
                numCandidates: Math.max(size*10, 1000),
                limit: size,
                index: this.indexName,
            }
        }, {
            "$addFields": {
                relevance: { "$meta": "vectorSearchScore" }
            }
        }, {
            "$unset": ["semantic_embedding"]
        }])
        return await documentAggregationCursor.toArray()
    }
}
