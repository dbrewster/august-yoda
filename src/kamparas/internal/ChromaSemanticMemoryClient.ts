import {SemanticMemoryClient, SemanticWrapper} from "@/kamparas/internal/SemanticMemoryClient"
import {SemanticMemory} from "@/kamparas/Memory"
import {Logger} from "winston"
import {ChromaClient, OpenAIEmbeddingFunction} from "chromadb"
import {nanoid} from "nanoid"
import {mongoCollection} from "@/util/util"
import {DateTime} from "luxon"
import {AgentIdentifier} from "@/kamparas/Agent";
import {IncludeEnum} from "chromadb/dist/main/types";

export class ChromaSemanticMemoryClient extends SemanticMemoryClient {
    embedder: OpenAIEmbeddingFunction
    private agentId: AgentIdentifier;
    client: ChromaClient

    constructor(agentId: AgentIdentifier, logger?: Logger) {
        super(logger)
        this.agentId = agentId;

        this.embedder = new OpenAIEmbeddingFunction({
            openai_api_key: process.env.OPENAI_API_KEY!
        })
        this.client = new ChromaClient({
            path: process.env.CHROMA_URL
        })
    }

    private async getCollection() {
        return await this.client.getOrCreateCollection({
            name: `${this.agentId.title}_semantic_memories`,
            embeddingFunction: this.embedder
        })
    }

    async recordSemanticMemories(semantic_string: string, memories: Omit<SemanticMemory, "timestamp" | "semantic_embedding" | "semantic_string">[]): Promise<void> {
        const chromaCollection = await this.getCollection()
        const embedding = (await this.embedder.generate([semantic_string]))
        let chromaId = nanoid()
        await chromaCollection.add({
            ids: [chromaId],
            embeddings: embedding,
        })
        const collection = await this.getMongoCollection()
        await collection.insertMany(memories.map(memory => ({
            memory_id: chromaId,
            memory: memory,
            semantic_string: semantic_string,
            timestamp: DateTime.now().toISO()!,
        })))
    }

    private async getMongoCollection() {
        return mongoCollection(`${this.agentId.title}_semantic_memories`);
    }

    async recordSemanticMemory(memory: Omit<SemanticMemory, "timestamp">): Promise<void> {
        const chromaCollection = await this.getCollection()
        const embedding = (await this.getEmbeddings(memory.semantic_string))
        let chromaId = nanoid()
        await chromaCollection.add({
            ids: [chromaId],
            embeddings: [embedding],
        })
        const collection = await this.getMongoCollection()
        await collection.insertOne({
            memory_id: chromaId,
            memory: memory,
            timestamp: DateTime.now().toISO()!,
        })
    }

    async searchSemanticMemory(query: string, size: number): Promise<SemanticWrapper[]> {
        const chromaCollection = await this.getCollection()
        const collection = await this.getMongoCollection()
        const embedding = (await this.getEmbeddings(query))
        const result = await chromaCollection.query({
            queryEmbeddings: [embedding],
            nResults: size,
            include: [IncludeEnum.Distances]
        })
        const distances = result.distances!
        const docs = (await Promise.all(result.ids.map(async (id, index) => {
            const resultsForId = await collection.find<Record<string, any>>({memory_id: id}).toArray()
            return resultsForId.map(doc => ({
                memory: doc.memory,
                relevance: distances[index][0]
            } as SemanticWrapper))
        }))).flat()

        return Promise.resolve(docs)
    }
}
