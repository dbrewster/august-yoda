import {rootLogger} from "@/util/RootLogger";
import {Logger} from "winston";
import {Client} from '@elastic/elasticsearch'
import {nanoid} from "nanoid";
import process from "process";
import {SemanticMemory} from "@/kamparas/Memory";
import {ResponseError} from "@elastic/transport/lib/errors";
import {DateTime} from "luxon";


export class SemanticMemoryClient {
    private logger
    private index
    private client
    private autoRefresh// elastic auto refreshes every second, which is good enough for everything but tests

    constructor(agentId: string, autoRefresh: boolean=false, logger?: Logger) {
        this.logger = logger || rootLogger
        this.client = new Client({
            node: process.env.ELASTIC_URL,
            tls: { ca: process.env.ELASTIC_CA, rejectUnauthorized: false }
        })
        this.index = ("semantic_" + agentId).toLowerCase()
        this.autoRefresh = autoRefresh
    }

    async initialize() {
        await this.client.indices.create({index: this.index}).then(() => {
            this.logger.info(`Created Elastic index "${this.index}"`)
        }).catch(err => {
            if (err instanceof ResponseError && err.message.startsWith("resource_already_exists_exception")) {
                this.logger.info(`Elastic index "${this.index}" already exists`)
            } else {
                throw err
            }
        })
        return this
    }

    async recordSemanticMemory(memory: Omit<SemanticMemory, "timestamp">) {
        await this.client.create({
            id: nanoid(),
            index: this.index,
            document: {...memory, timestamp: DateTime.now().toISO()!},
            refresh: this.autoRefresh
        })
    }

    async recordSemanticMemories(memories: Omit<SemanticMemory, "timestamp">[]) {
        await this.client.bulk({
            index: this.index,
            operations: memories.map(memory => {
                return {
                    create: {
                        id: nanoid(),
                        document: {...memory, timestamp: DateTime.now().toISO()!},
                        refresh: this.autoRefresh,
                    }
                }
            })
        })
    }


    async searchSemanticMemory(query: string, min_score=.01, size=1000) {
        // todo, how we search semantic memory should be massively refined when we have a way to define performance
        return (await this.client.search({
            index: this.index,
            query: {
                match: { content: query }
            },
            min_score: min_score,
            size: size,
        })).hits
    }
}
