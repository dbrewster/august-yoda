import {AgentMemory, NoOpMemory} from "@/kamparas/Memory"
import {AgentEnvironment, NoOpEnvironment} from "@/kamparas/Environment"
import {Logger} from "winston"
import {rootLogger} from "@/util/RootLogger"
import {
    AutonomousQAManager,
    AutonomousSkilledWorker,
    AutonomousWorker,
    AutonomousWorkerManager,
    QAManager,
    SkilledWorker,
    WorkerManager
} from "@/praxeum/Worker"
import {Concept, getAllConcepts} from "@/obiwan/concepts/Concept"
import {getOrCreateSchemaManager} from "@/kamparas/SchemaManager"
import {z} from "zod"
import {PlatformBuilder} from "@/kamparas/PlatformBuilder"
import {Resource, ResourceStatus} from "@/praxeum/server/DeploymentDescriptor"
import {LLMType, ModelType} from "@/kamparas/LLM"
import {AgentTemplateDescriptor, OperatorStateChange} from "@/praxeum/server/Operator"
import {registerIdentifier} from "@/kamparas/AgentRegistry"

export abstract class AgentTemplateBuilder {
    logger: Logger;
    memory: AgentMemory = new NoOpMemory()
    environment: AgentEnvironment = new NoOpEnvironment()
    envBuilder: PlatformBuilder
    abstract title: string
    abstract status: ResourceStatus

    protected constructor(envBuilder: PlatformBuilder) {
        this.envBuilder = envBuilder
        this.logger = rootLogger.child({type: this.getLogType()})
    }

    abstract build(resource: Resource): Promise<void>

    abstract start(): Promise<OperatorStateChange[]>

    abstract shutdown(): Promise<OperatorStateChange[]>

    getLogType() {
        return "agent-template"
    }
}

export interface ConceptWorkers {
    worker: AutonomousSkilledWorker
    manager: AutonomousWorkerManager
    qa: AutonomousQAManager
}

interface WorkerLLMOptions {
    llm: LLMType,
    model: ModelType,
    temperature: number
}

interface ConceptAgentBuilderDescriptor extends AgentTemplateDescriptor {
    options: {
        worker: WorkerLLMOptions,
        qa: WorkerLLMOptions,
        manager: WorkerLLMOptions
    }
}

export class ConceptAgentBuilder extends AgentTemplateBuilder {
    concepts: ConceptWorkers[] = []
    title: string = ""
    status: ResourceStatus = "stopped"

    async build(resource: Resource): Promise<void> {
        const descriptor = resource as ConceptAgentBuilderDescriptor
        this.title = resource.title
        this.status = resource.status || "stopped"
        const concepts = await getAllConcepts()
        this.logger.info(`Building concept agents for [${concepts.map(c => c.name).join(",")}]`)
        const wrap = <T extends AutonomousWorker>(agent: T, llmOptions: WorkerLLMOptions): T => {
            agent.initialize({
                memory: this.envBuilder.buildMemory(agent.agent_identifier),
                environment: this.envBuilder.buildEnvironment(),
                llm: this.envBuilder.buildLLM(llmOptions.llm, llmOptions.model, llmOptions.temperature || 0.2)
            })

            registerIdentifier(agent.agent_identifier)
            return agent
        }
        this.concepts = concepts.map(concept => {
            return {
                worker: wrap(this.buildWorker(concept), descriptor.options.worker),
                manager: wrap(this.buildManager(concept), descriptor.options.manager),
                qa: wrap(this.buildQA(concept), descriptor.options.qa)
            }
        })
        return Promise.resolve(undefined)
    }

    allWorkers(): AutonomousWorker[] {
        return this.concepts.map(c => [c.worker, c.manager, c.qa]).flat()
    }

    async start(): Promise<OperatorStateChange[]> {
        const changes: OperatorStateChange[] = []
        for (const worker of this.allWorkers()) {
            const change: OperatorStateChange = {
                title: worker.title,
                priorStatus: worker.status,
                newStatus: worker.status
            }
            if (worker.status === "stopped") {
                await worker.start()
                change.newStatus = "started"
            }
            changes.push(change)
        }

        this.status = "started"
        return changes
    }

    async shutdown(): Promise<OperatorStateChange[]> {
        const changes: OperatorStateChange[] = []
        for (const worker of Object.values(this.allWorkers())) {
            const change: OperatorStateChange = {
                title: worker.title,
                priorStatus: worker.status,
                newStatus: worker.status
            }
            if (worker.status === "started") {
                await worker.shutdown()
                change.newStatus = "stopped"
            }
            changes.push(change)
        }

        this.status = "stopped"
        return changes
    }

    private buildWorker(concept: Concept): AutonomousSkilledWorker {
        return new AutonomousSkilledWorker({
            title: `${concept.name}_worker`,
            identifier: "alpha",
            job_description: `This is an export for all things related to the concept ${concept.name}. Use this tool to generate a Query object or to modify the concept in any way`,
            initial_plan: "",
            initial_plan_instructions: "",
            overwrite_plan: false,
            overwrite_plan_instructions: false,
            input_schema: getOrCreateSchemaManager().compileZod(z.object({
                question: z.string().describe("The question the user is asking of this concept")
            })),
            answer_schema: getOrCreateSchemaManager().compileZod(z.object({
                answer: z.string().describe("A detailed answer to the users question")
            })),
            availableTools: [`${concept.name}_manager`, `${concept.name}_qa`],
            manager: `${concept.name}_manager`,
            qaManager: `${concept.name}_qa`,
            maxConcurrentThoughts: 10
        })
    }

    private buildManager(concept: Concept): AutonomousWorkerManager {
        return new AutonomousWorkerManager({
            title: `${concept.name}_manager`,
            identifier: "alpha",
            job_description: `Provides help to blocked workers`,
            initial_plan: `You are a manager of workers. You are responsible for providing a plan for how
  they should proceed. Consider the problem the problems the worker is facing
  and the resources they have to solve the problem.

  Create a plan for the worker to solve the problem if it is possible.

  Tell the worker "STOP WORKING" if they they cannot progress or are not making progress.`,
            initial_plan_instructions: `I am trying am having a problem with "{problem}" and am unsure how to proceed.
  What should I do?


  I have the following tools available:

  {available_tools}


  Here is some context for the problem:

  {context}`,
            overwrite_plan: false,
            overwrite_plan_instructions: false,
            input_schema: getOrCreateSchemaManager().compileZod(z.object({
                problem: z.string().describe("issue at hand"),
                available_tools: z.string().describe("A list of external resources I have available and short a short description of each."),
                context: z.string().describe("information relevant to the question"),
            })),
            answer_schema: getOrCreateSchemaManager().compileZod(z.object({
                response: z.string().describe("A detailed answer to the users question")
            })),
            availableTools: [],
            maxConcurrentThoughts: 10
        })
    }

    private buildQA(concept: Concept): AutonomousQAManager {
        return new AutonomousQAManager({
            title: `${concept.name}_qa`,
            identifier: "alpha",
            job_description: `An agent designed to check correctness`,
            initial_plan: `You are a helpful agent designed do qa for other agents. You are
  responsible for assuring correctness. Come up with a test plan for provided
  question. Use the test plan to determine the correctness probability (between
  0 and 1) of the provided solution. Think step by step.`,
            initial_plan_instructions: `Is the following solution correct?
  ### Question ###
  {question}
  ### Solution ###
  {solution}`,
            overwrite_plan: false,
            overwrite_plan_instructions: false,
            input_schema: getOrCreateSchemaManager().compileZod(z.object({
                question: z.string().describe("The question which needs validating"),
                solution: z.string().describe("The proposed solution to that question"),
            })),
            answer_schema: getOrCreateSchemaManager().compileZod(z.object({
                rational: z.string().describe("A description of why the solution was correct or incorrect."),
                correctness: z.number().describe("The probability the provided solution correctly answers the provided question")
            })),
            manager: `${concept.name}_manager`,
            availableTools: [`${concept.name}_manager`],
            maxConcurrentThoughts: 10
        })
    }
}
