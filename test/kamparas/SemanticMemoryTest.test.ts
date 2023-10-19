import dotenv from "dotenv";
import {SemanticMemory} from "@/kamparas/Memory";
import {nanoid} from "nanoid";
import {MongoSemanticMemoryClient} from "@/kamparas/internal/SemanticMemoryClient";
import {shutdownMongo} from "@/util/util"
import {delay} from "underscore"

dotenv.config()
let em: MongoSemanticMemoryClient

describe("MongoMemory", () => {
    beforeEach(async () => {
        dotenv.config()
        em = new MongoSemanticMemoryClient(nanoid())
        await em.initialize()
    })

    afterAll(async () => {
        await shutdownMongo()
    })

    describe("recordSemanticMemory", () => {
        test("Does not throw", async () => {
            await em.recordSemanticMemory(semantic("here is some content")
            )
        })
    })

    describe("searchSemanticMemory", () => {
        test("finds only related events", async () => {
            let agentId = nanoid();
            await em.recordSemanticMemory(semantic("dave dave dave"))
            await em.recordSemanticMemory(semantic("luke luke luke"))
            await em.recordSemanticMemory(semantic("luke john jill"))
            const found = await retry(() => em.searchSemanticMemory('luke'), found => found.length === 3)

            const nnn = found.sort((a, b) => a.relevance < b.relevance ? 1: -1)[0]
            expect(nnn.memory.semantic_string).toEqual("luke luke luke")
        })

        test('behaves well with no hits', async () => {
            await retry(() => em.searchSemanticMemory('not gunna happen'), )
            let found = await em.searchSemanticMemory('not gunna happen');
            expect(found).toEqual([])
        })
    })

    describe("recordSemanticMemories", () => {
        test("creates multiple records", async () => {
            await em.recordSemanticMemories("search term includes luke", [
                semantic(""),
                semantic(""),
                semantic(""),
            ])
            const found = await em.searchSemanticMemory('luke')

            // @ts-ignore
            expect(found.length).toEqual(3)
        })
    })

    describe("initialize", () => {
        test("gracefully handles existing indices", async () => {
            await em.initialize()
        })
    })

})

async function retry<T>(fn: () => Promise<T>, until: (arg0: T) => boolean = (arg0) => true, max_retries = 10, retry_delay=100) {
    let rtn
    for (let i = 0; i <= max_retries; i++) {
        let error: any
        rtn = await fn().catch(e => {
            error = e
            return e
        })
        if (!error && until(rtn)) {
            return rtn as T
        }
        await new Promise( resolve => setTimeout(resolve, retry_delay) )
    }
    throw new Error(`retry fn never returned with a valid response. Last: ${JSON.stringify(rtn)}`)
}

function semantic(content: string): Omit<SemanticMemory, "semantic_embedding"> {
    return {
        type: "reflection",
        agent_title: "common_title",
        agent_id: "agent_id",
        conversation_id: nanoid(),
        semantic_string: content,
        memory: {summary: "here is a summary", events: []},
        importance: .4,
        timestamp: "july4",
    };
}
