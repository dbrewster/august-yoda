import dotenv from "dotenv";
import {Reflection, SemanticMemory} from "@/kamparas/Memory";
import {nanoid} from "nanoid";
import {SemanticMemoryClient} from "@/kamparas/internal/SemanticMemoryClient";

dotenv.config()
let em: SemanticMemoryClient

describe("MongoMemory", () => {
    beforeEach(async () => {
        dotenv.config()
        em = new SemanticMemoryClient(nanoid(), true)
        await em.initialize()
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
            await em.recordSemanticMemory(semantic("event related to dave"))
            await em.recordSemanticMemory(semantic("event related to luke"))
            const found = await em.searchSemanticMemory('luke')

            // @ts-ignore
            expect(found.total.value).toEqual(1)
        })

        test('behaves well with no hits', async () => {
            let found = await em.searchSemanticMemory('not gunna happen');
            expect(found.hits).toEqual([])
        })
    })

    describe("recordSemanticMemories", () => {
        test("creates multiple records", async () => {
            await em.recordSemanticMemories([
                semantic("event related to luke"),
                semantic("event related to luke again"),
                semantic("event related to dave"),
            ])
            const found = await em.searchSemanticMemory('luke')

            // @ts-ignore
            expect(found.total.value).toEqual(2)
        })
    })

    describe("initialize", () => {
        test("gracefully handles existing indices", async () => {
            await em.initialize()
        })
    })

})

function semantic(content: string): SemanticMemory {
    return {
        type: "reflection",
        agent_title: "common_title",
        agent_id: "agent_id",
        conversation_id: nanoid(),
        data: {},
        memory: { summary: content, events: [] },
        importance: .4,
        timestamp: "july4",
    };
}
