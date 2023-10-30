import {CodeAgent, CodeAgentOptions} from "@/kamparas/CodeAgent"
import {HelpResponse, NewTaskInstruction} from "@/kamparas/Environment"
import {getOrCreateSchemaManager} from "@/kamparas/SchemaManager"
import {z} from "zod"
import {mongoCollection} from "@/util/util";
import {EpisodicEvent} from "@/kamparas/Memory";
import {LLM} from "@/kamparas/LLM";

interface ReflectConversationParams {
    agent_title: string,
    agent_identifier: string,
    conversation_id: string
}

export class ReflectConversation extends CodeAgent {
    static TOOL_NAME = "reflect_conversation"

    constructor(options: CodeAgentOptions) {
        super(options, {
            identifier: "alpha",
            job_description: `Reflects on the last conversation the tool had. This tool returns the last plan and reflections for both the planner and the worker. The planner should use these reflections to make a new plan`,
            input_schema: getOrCreateSchemaManager().compileZod(z.object({
                agent_title: z.string().describe("The title of the agent"),
                agent_identifier: z.string().describe("The identifier of the agent"),
                conversation_id: z.string().describe("The conversation id")
            })),
            answer_schema: getOrCreateSchemaManager().compileZod(z.object({}))
        })
    }

    static async getEvents(args: ReflectConversationParams, llm: LLM) {
        const collection = await mongoCollection("episodic")
        return (await collection.find<EpisodicEvent>({agent_title: args.agent_title, agent_id: args.agent_identifier, conversation_id: args.conversation_id}).toArray()).filter(event => {
            switch (event.type) {
                case "task_start":
                case "available_tools":
                    return false
                default:
                    return true
            }
        }).map(event => JSON.stringify(llm.formatMessage(event, []))).join("\n")
    }

    async exec(instruction: NewTaskInstruction, conversationId: string): Promise<void> {
        const args = instruction.input as ReflectConversationParams
        let events = await ReflectConversation.getEvents(args, this.llm);
        console.log(events)
        this.askForHelp(conversationId, "MemoryReflector", this.getTaskContext(conversationId), {
            events: events,
            number_of_insights: 3
        }, {
            args: args
        })
    }

    async processHelpResponse(response: HelpResponse, callContext: any): Promise<void> {
        const args = callContext.args as ReflectConversationParams
        const insights = response.response.insights
        const collection = await mongoCollection("reflections")
        await collection.insertOne({
            ...args,
            insights: insights
        })
        this.doAnswer(response.conversation_id, response.request_id, {})
    }
}

/*

dotenv.config()

const collection = await mongoCollection("learner_plan")
const docs = await collection.find<Record<string, string>>({}).sort({timestamp: -1}).limit(1).toArray()

console.log(JSON.stringify(docs, null, 2))

const doc = docs![0]
const conversation_id = doc.helpee_conversation_id

const events_collection = await mongoCollection("episodic")
const callsToWorker = await events_collection.find<EpisodicEvent>({agent_title: "root_worker", type: "task_start", "content.helpee_conversation_id": conversation_id}).toArray()

console.log(JSON.stringify(callsToWorker, null, 2))

const llm = new OpenAIFunctionsLLM("gpt-3.5-turbo-16k", 0)
const convEnvents = await ReflectLastConversation.getEvents(conversation_id, llm)
console.log(JSON.stringify(convEnvents, null, 2))

const workerEvents = await ReflectLastConversation.getEvents(conversation_id, llm)
console.log(JSON.stringify(workerEvents, null, 2))
*/
