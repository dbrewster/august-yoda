import {MongoMemory} from "@/kamparas/internal/MongoMemory";
import {ValidateFunction} from "ajv";
import {nanoid} from "nanoid";
import {EpisodicEvent} from "@/kamparas/Memory";
import {AgentIdentifier} from "@/kamparas/Agent";

describe("MongoMemory", () => {
    describe("plans", () => {
        test("can read/write plan", async () => {
            let mm = mongoMemory()
            await mm.recordPlan("test template")
            let plan = await mm.readPlan({})
            expect(plan).toEqual("test template")
        })

        test("can read/write instructions", async () => {
            let mm = mongoMemory()
            await mm.recordPlanInstructions("test template")
            let plan = await mm.readPlanInstructions({})
            expect(plan).toEqual("test template")
        })
    })

    describe("episodic memory",() => {
        test("can read/write episodic memory", async () => {
            let task_id = nanoid()
            let ai = agentIdentifier()
            let mm = mongoMemory(ai)
            await mm.recordEpisodicEvent(episodicEvent(ai.identifier, task_id, "1"))
            let found = await mm.readEpisodicEventsForTask(task_id)
            expect(found.length).toEqual(1)
        })

        test("can read multiple", async () => {
            let task_id = nanoid()
            let ai = agentIdentifier()
            let mm = mongoMemory(ai)
            await mm.recordEpisodicEvent(episodicEvent(ai.identifier, task_id, "1"))
            await mm.recordEpisodicEvent(episodicEvent(ai.identifier, task_id, "2"))
            let found = await mm.readEpisodicEventsForTask(task_id)
            expect(found.length).toEqual(2)
        })

        test("reads in order", async () => {
            let task_id = nanoid()
            let ai = agentIdentifier()
            let mm = mongoMemory(ai)
            await mm.recordEpisodicEvent(episodicEvent(ai.identifier, task_id, "1"))
            await mm.recordEpisodicEvent(episodicEvent(ai.identifier, task_id, "3"))
            await mm.recordEpisodicEvent(episodicEvent(ai.identifier, task_id, "2"))
            let found = await mm.readEpisodicEventsForTask(task_id)
            expect(found.map(ee => ee.timestamp)).toEqual(["1","2","3"])
        })

        test("can limit responses", async () => {
            let task_id = nanoid()
            let ai = agentIdentifier()
            let mm = mongoMemory(ai)
            await mm.recordEpisodicEvent(episodicEvent(ai.identifier, task_id, "1"))
            await mm.recordEpisodicEvent(episodicEvent(ai.identifier, task_id, "3"))
            await mm.recordEpisodicEvent(episodicEvent(ai.identifier, task_id, "2"))
            let found = await mm.readEpisodicEventsForTask(task_id, 2)
            expect(found.map(ee => ee.timestamp)).toEqual(["1","2"])
        })
    })
})


function episodicEvent(agent_id: string, task_id: string, timestamp: string): EpisodicEvent {
    return {
        actor: "external",
        type: "task_start",
        agent_id: agent_id,
        task_id: task_id,
        content: "here is some content",
        timestamp: timestamp,
    };
}


function agentIdentifier() {
    return {
        title: `test_title_${nanoid()}`,
        job_description: "some description here",
        identifier: nanoid(),
        input_schema: null as unknown as ValidateFunction<Object>,
        answer_schema: null as unknown as ValidateFunction<Object>,
    }
}

function mongoMemory(ai?: AgentIdentifier) {
    if (!ai) {
        ai = agentIdentifier()
    }
    return new MongoMemory(ai)
}