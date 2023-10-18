import {AgentMemory, NoOpMemory} from "@/kamparas/Memory"
import {AgentEnvironment, NoOpEnvironment} from "@/kamparas/Environment"
import {Logger} from "winston"
import {rootLogger} from "@/util/RootLogger"
import {AutonomousQAManager, AutonomousSkilledWorker, AutonomousWorker, AutonomousWorkerManager} from "@/praxeum/Worker"
import {Concept} from "@/obiwan/concepts/Concept"
import {getOrCreateSchemaManager} from "@/kamparas/SchemaManager"
import {z} from "zod"
import {PlatformBuilder} from "@/kamparas/PlatformBuilder"
import {Resource, ResourceStatus} from "@/praxeum/server/DeploymentDescriptor"
import {LLMType, ModelType} from "@/kamparas/LLM"
import {AgentTemplateDescriptor, OperatorStateChange} from "@/praxeum/server/Operator"
import {registerIdentifier} from "@/kamparas/AgentRegistry"
import {getTypeSystem, ROOT_TYPE_SYSTEM} from "@/obiwan/concepts/TypeSystem"
import {TemplateProcessor} from "@/util/TemplateProcessor"

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

interface AgentDeploymentOptions {
        title: string,
        job_description: string,
        initial_plan: string,
        initial_plan_instructions: string,
        availableTools: string[]
}

interface WorkerLLMOptions {
    llm: LLMType,
    model: ModelType,
    temperature: number
    deployment: AgentDeploymentOptions
}

interface ConceptAgentBuilderDescriptor extends AgentTemplateDescriptor {
    options: {
        worker: WorkerLLMOptions,
        qa: WorkerLLMOptions,
        manager: WorkerLLMOptions
    }
}

// noinspection JSUnusedGlobalSymbols
export class ConceptAgentBuilder extends AgentTemplateBuilder {
    concepts: ConceptWorkers[] = []
    title: string = ""
    status: ResourceStatus = "stopped"

    private processAgentTemplate(concept: Concept, deployment: AgentDeploymentOptions): AgentDeploymentOptions {
        const input = {concept: concept}
        return {
            title: TemplateProcessor.process(deployment.title, input),
            job_description: TemplateProcessor.process(deployment.job_description, input),
            initial_plan: TemplateProcessor.process(deployment.initial_plan, input),
            initial_plan_instructions: TemplateProcessor.process(deployment.initial_plan_instructions, input),
            availableTools: deployment.availableTools
        }
    }

    async build(resource: Resource): Promise<void> {
        const descriptor = resource as ConceptAgentBuilderDescriptor
        this.title = resource.title
        this.status = resource.status || "stopped"
        // todo -- fix this to get value from context once we add it.
        const typeSystemId = ROOT_TYPE_SYSTEM
        const typeSystem = await getTypeSystem(typeSystemId)
        const concepts = typeSystem.getAllConcepts()
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
                worker: wrap(this.buildWorker(concept, this.processAgentTemplate(concept, descriptor.options.worker.deployment)), descriptor.options.worker),
                manager: wrap(this.buildManager(concept, this.processAgentTemplate(concept, descriptor.options.manager.deployment)), descriptor.options.manager),
                qa: wrap(this.buildQA(concept, this.processAgentTemplate(concept, descriptor.options.qa.deployment)), descriptor.options.qa)
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

    private buildWorker(concept: Concept, deployment: AgentDeploymentOptions): AutonomousSkilledWorker {
        return new AutonomousSkilledWorker({
            title: deployment.title,
            identifier: "alpha",
            job_description: deployment.job_description,
            initial_plan: deployment.initial_plan,
            initial_plan_instructions: deployment.initial_plan_instructions,
            overwrite_plan: false,
            overwrite_plan_instructions: false,
            input_schema: getOrCreateSchemaManager().compileZod(z.object({
                question: z.string().describe("The question the user is asking of this concept")
            })),
            answer_schema: getOrCreateSchemaManager().compileZod(z.object({
                answer: z.string().describe("A detailed answer to the users question")
            })),
            availableTools: [`${concept.name}_manager`, `${concept.name}_qa`].concat(deployment.availableTools),
            manager: `${concept.name}_manager`,
            qaManager: `${concept.name}_qa`,
            maxConcurrentThoughts: 10
        })
    }

    private buildManager(_concept: Concept, deployment: AgentDeploymentOptions): AutonomousWorkerManager {
        return new AutonomousWorkerManager({
            title: deployment.title,
            identifier: "alpha",
            job_description: deployment.job_description,
            initial_plan: deployment.initial_plan,
            initial_plan_instructions: deployment.initial_plan_instructions,
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
            availableTools: deployment.availableTools,
            maxConcurrentThoughts: 10
        })
    }

    private buildQA(concept: Concept, deployment: AgentDeploymentOptions): AutonomousQAManager {
        return new AutonomousQAManager({
            title: deployment.title,
            identifier: "alpha",
            job_description: deployment.job_description,
            initial_plan: deployment.initial_plan,
            initial_plan_instructions: deployment.initial_plan_instructions,
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
            availableTools: [`${concept.name}_manager`].concat(deployment.availableTools),
            maxConcurrentThoughts: 10
        })
    }
}
