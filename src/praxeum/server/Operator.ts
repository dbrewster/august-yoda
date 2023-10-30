import {AgentRegistry} from "@/kamparas/AgentRegistry";
import {AutonomousQAManager, AutonomousSkilledWorker, AutonomousWorkerManager} from "@/praxeum/Worker";
import _ from "underscore"
import {
    AutonomousAgentDescriptor,
    AutonomousWorkerDescriptor,
    CodeAgentDescriptor,
    ManagerDescriptor,
    QAManagerDescriptor,
    Resource,
    ResourceStatus,
    ResourceType,
    SkilledWorkerDescriptor
} from "@/praxeum/server/DeploymentDescriptor";
import {rootLogger} from "@/util/RootLogger";
import {getOrCreateSchemaManager} from "@/kamparas/SchemaManager";
import {Agent, AgentIdentifier} from "@/kamparas/Agent";
import {CodeAgentOptions} from "@/kamparas/CodeAgent";
import {PlatformBuilder} from "@/kamparas/PlatformBuilder"
import {AgentTemplateBuilder} from "@/praxeum/concept/ConceptAgentBuilder"

export interface OperatorEnvironment {
    writeResource(resource: Resource): void

    deleteResource(title: string): void

    toggleStatus(title: string, status: ResourceStatus): void;
}

export interface OperatorStateChange {
    title: string,
    priorStatus: ResourceStatus,
    newStatus: ResourceStatus
}

export interface ResourceAndStatus {
    resource: string,
    status: ResourceStatus
}

export abstract class Operator {
    abstract operatorResourceType: ResourceType
    envBuilder: PlatformBuilder
    logger = rootLogger.child({type: "agent-operator"})
    constructor(envBuilder: PlatformBuilder) {
        this.envBuilder = envBuilder
    }

    changes(object: Record<string, any>, base: Record<string, any>) {
        const keySet = new Set(Object.keys(object).concat(Object.keys(base)))
        Object.keys(object).forEach(k => {
            if (_.isEqual(object[k], base[k])) {
                keySet.delete(k)
            }
        })

        return Array.from(keySet)
    }

    abstract apply(resource: Resource, environment: OperatorEnvironment): Promise<boolean>

    abstract delete(resource: Resource, environment: OperatorEnvironment): Promise<boolean>

    async startAll(_environment: OperatorEnvironment): Promise<OperatorStateChange[]> {
        return []
    }

    async stopAll(_environment: OperatorEnvironment): Promise<OperatorStateChange[]> {
        return []
    }

    status(_environment: OperatorEnvironment): ResourceAndStatus[] {
        return []
    }
}

abstract class BaseAgentOperator extends Operator {

    existingAgents: Record<string, Agent> = {}

    protected abstract makeWorker(resource: Resource): Promise<Agent>

    protected descriptorToIdentifier<T extends AutonomousAgentDescriptor>(workerDescriptor: T) {
        return {
            identifier: workerDescriptor.identifier,
            title: workerDescriptor.title,
            job_description: workerDescriptor.job_description,
            input_schema: getOrCreateSchemaManager().compile(JSON.stringify(workerDescriptor.input_schema)),
            answer_schema: getOrCreateSchemaManager().compile(JSON.stringify(workerDescriptor.output_schema)),
            is_root: workerDescriptor.is_root || false,
        } as AgentIdentifier
    }

    async apply(resource: Resource, environment: OperatorEnvironment): Promise<boolean> {
        if (resource.kind == this.operatorResourceType) {
            let existingAgent = this.existingAgents[resource.title];
            if (existingAgent) {
                const changedKeys = this.changes(resource, existingAgent)
                if (changedKeys.length > 0) {
                    // Special case -- we are just changing the run state of the resource
                    if (changedKeys.length == 1 && changedKeys[0] === "status") {
                        if (resource.status == "started") {
                            await this.existingAgents[resource.title].start()
                        } else {
                            await this.existingAgents[resource.title].shutdown()
                        }
                    } else {
                        await this.existingAgents[resource.title].shutdown()
                        this.existingAgents[resource.title] = await this.makeWorker(resource)
                    }

                    environment.writeResource(resource)
                } else {
                    this.logger.info(`Agent ${resource.title} unchanged`)
                }
            } else {
                let agent = await this.makeWorker(resource);

                this.existingAgents[resource.title] = agent
                if (resource.status === "started") {
                    await agent.start()
                }
                environment.writeResource(resource)
            }
            AgentRegistry.registerIdentifier(this.existingAgents[resource.title].agent_identifier)
            return true
        }
        return false
    }

    async delete(resource: Resource, environment: OperatorEnvironment): Promise<boolean> {
        if (resource.kind == this.operatorResourceType) {
            if (this.existingAgents[resource.title]) {
                await this.existingAgents[resource.title].shutdown()
                delete this.existingAgents[resource.title]
            }
            environment.deleteResource(resource.title)
            AgentRegistry.deleteIdentifier(resource.title)
            return true
        }
        return false
    }

    async startAll(environment: OperatorEnvironment) {
        const changes: OperatorStateChange[] = []
        for (const worker of Object.values(this.existingAgents)) {
            const change: OperatorStateChange = {
                title: worker.title,
                priorStatus: worker.status,
                newStatus: worker.status
            }
            if (worker.status === "stopped") {
                await worker.start()
                environment.toggleStatus(worker.title, "started")
                change.newStatus = "started"
            }
            changes.push(change)
        }

        return changes
    }

    async stopAll(environment: OperatorEnvironment) {
        const changes: OperatorStateChange[] = []
        for (const worker of Object.values(this.existingAgents)) {
            const change: OperatorStateChange = {
                title: worker.title,
                priorStatus: worker.status,
                newStatus: worker.status
            }
            if (worker.status === "started") {
                await worker.shutdown()
                environment.toggleStatus(worker.title, "stopped")
                change.newStatus = "stopped"
            }
            changes.push(change)
        }

        return changes
    }

    status(_environment: OperatorEnvironment): ResourceAndStatus[] {
        return Object.values(this.existingAgents).map(a => ({resource: a.title, status: a.status} as ResourceAndStatus))
    }
}

/*
  Watches for changes to autonomous agent descriptors
 */
export class AutonomousAgentOperator extends BaseAgentOperator {
    operatorResourceType: ResourceType = "AutonomousWorker"

    protected async makeWorker(resource: Resource): Promise<Agent> {
        const agentDescriptor = resource as AutonomousWorkerDescriptor

        this.logger.info(`processing ${agentDescriptor.title}`)
        const identifier = this.descriptorToIdentifier(agentDescriptor)
        switch (agentDescriptor.deployment_type) {
            case "SkilledWorker": {
                const descriptor = agentDescriptor as SkilledWorkerDescriptor
                const agent = new AutonomousSkilledWorker({
                    ...identifier,
                    initial_plan: descriptor.initial_plan,
                    overwrite_plan: descriptor.overwrite_plan || process.env.OVERWRITE_PLAN === "true",
                    initial_plan_instructions: descriptor.initial_instructions,
                    overwrite_plan_instructions: descriptor.overwrite_plan_instructions || process.env.OVERWRITE_PLAN_INSTRUCTIONS === "true",
                    upgradeThoughtsThreshold: descriptor.upgrade_llm_thought_threshold || 5,
                    maxConcurrentThoughts: descriptor.max_thoughts || 10,
                    availableTools: descriptor.available_tools,
                    manager: descriptor.manager,
                    qaManager: descriptor.qaManager,
                })
                agent.initialize({memory: this.envBuilder.buildMemory(agent.agent_identifier), environment: this.envBuilder.buildEnvironment(), llm: this.envBuilder.buildLLM(descriptor.llm, descriptor.model, descriptor.temperature || 0.2)})
                return agent
            }
            case "Manager": {
                const descriptor = agentDescriptor as ManagerDescriptor
                const agent = new AutonomousWorkerManager({
                    ...identifier,
                    initial_plan: descriptor.initial_plan,
                    overwrite_plan: descriptor.overwrite_plan || process.env.OVERWRITE_PLAN === "true",
                    initial_plan_instructions: descriptor.initial_instructions,
                    overwrite_plan_instructions: descriptor.overwrite_plan_instructions || process.env.OVERWRITE_PLAN_INSTRUCTIONS === "true",
                    upgradeThoughtsThreshold: 10,
                    maxConcurrentThoughts: descriptor.max_thoughts || 5,
                    availableTools: descriptor.available_tools,
                    manager: descriptor.manager
                })
                agent.initialize({memory: this.envBuilder.buildMemory(agent.agent_identifier), environment: this.envBuilder.buildEnvironment(), llm: this.envBuilder.buildLLM(descriptor.llm, descriptor.model, descriptor.temperature || 0.2)})
                return agent
            }

            case "QAManager": {
                const descriptor = agentDescriptor as QAManagerDescriptor
                const agent = new AutonomousQAManager({
                    ...identifier,
                    initial_plan: descriptor.initial_plan,
                    overwrite_plan: descriptor.overwrite_plan || process.env.OVERWRITE_PLAN === "true",
                    initial_plan_instructions: descriptor.initial_instructions,
                    overwrite_plan_instructions: descriptor.overwrite_plan_instructions || process.env.OVERWRITE_PLAN_INSTRUCTIONS === "true",
                    upgradeThoughtsThreshold: 10,
                    maxConcurrentThoughts: descriptor.max_thoughts || 5,
                    availableTools: descriptor.available_tools,
                    manager: descriptor.manager,
                })
                agent.initialize({memory: this.envBuilder.buildMemory(agent.agent_identifier), environment: this.envBuilder.buildEnvironment(), llm: this.envBuilder.buildLLM(descriptor.llm, descriptor.model, descriptor.temperature || 0.2)})
                return agent
            }

            default:
                throw `Invalid agent type ${agentDescriptor.deployment_type} for ${JSON.stringify(agentDescriptor)}`
        }
    }
}

export class MetaConceptOperator extends Operator {
    operatorResourceType: ResourceType = "MetaConcept"

    async apply(resource: Resource, environment: OperatorEnvironment): Promise<boolean> {
        if (resource.kind == "MetaConcept") {
            environment.writeResource(resource)
            // todo -- figure this out...
            // registerIdentifier([resource])
            return true
        }
        return false;
    }

    async delete(resource: Resource, environment: OperatorEnvironment): Promise<boolean> {
        if (resource.kind == "MetaConcept") {
            environment.deleteResource(resource.title)
            AgentRegistry.deleteIdentifier(resource.title)
            return true
        }
        return false
    }
}

export class CodeAgentOperator extends BaseAgentOperator {
    operatorResourceType: ResourceType = "CodeAgent"

    protected async makeWorker(resource: Resource): Promise<Agent> {
        const agentDescriptor = resource as CodeAgentDescriptor

        this.logger.info(`processing ${agentDescriptor.title}`)

        const module = await import(agentDescriptor.module)
        const clazz = module[agentDescriptor.class]

        const options: CodeAgentOptions = {
            title: resource.title,
            llm: this.envBuilder.buildLLM("openai.function", "gpt-3.5-turbo-16k", 0)
        }
        const agent = new clazz(options)
        agent.initialize({memory: this.envBuilder.buildMemory(agent.agent_identifier), environment: this.envBuilder.buildEnvironment()})
        return agent
    }
}

export interface AgentTemplateDescriptor extends Resource {
    producer_class: {
        module: string
        class: string
    },
    options: Record<string, any>
}

export class AgentTemplateOperator extends Operator {
    operatorResourceType: ResourceType = "AgentTemplate"

    readonly templateBuilders: Record<string, AgentTemplateBuilder> = {}

    async makeWorker(agentDescriptor: AgentTemplateDescriptor) {
        const module = await import(agentDescriptor.producer_class.module)
        const clazz = module[agentDescriptor.producer_class.class]

        const template = new clazz(this.envBuilder) as AgentTemplateBuilder
        await template.build(agentDescriptor)
        return template
    }

    async apply(resource: Resource, environment: OperatorEnvironment): Promise<boolean> {
        if (resource.kind == this.operatorResourceType) {
            const agentDescriptor = resource as AgentTemplateDescriptor
            let existingBuilder = this.templateBuilders[resource.title];
            if (existingBuilder) {
                const changedKeys = this.changes(resource, existingBuilder)
                if (changedKeys.length > 0) {
                    // Special case -- we are just changing the run state of the resource
                    if (changedKeys.length == 1 && changedKeys[0] === "status") {
                        if (resource.status == "started") {
                            await this.templateBuilders[resource.title].start()
                        } else {
                            await this.templateBuilders[resource.title].shutdown()
                        }
                    } else {
                        await this.templateBuilders[resource.title].shutdown()
                        this.templateBuilders[resource.title] = await this.makeWorker(agentDescriptor)
                    }

                    environment.writeResource(resource)
                } else {
                    this.logger.info(`Agent ${resource.title} unchanged`)
                }
            } else {
                let agent = await this.makeWorker(agentDescriptor);

                this.templateBuilders[resource.title] = agent
                if (resource.status === "started") {
                    await agent.start()
                }
                environment.writeResource(resource)
            }
            return true
        }

        return false;
    }

    async delete(resource: Resource, environment: OperatorEnvironment): Promise<boolean> {
        if (resource.kind == this.operatorResourceType) {
            if (this.templateBuilders[resource.title]) {
                await this.templateBuilders[resource.title].shutdown()
                delete this.templateBuilders[resource.title]
            }
            environment.deleteResource(resource.title)
            AgentRegistry.deleteIdentifier(resource.title)
            return true
        }
        return false
    }

    async startAll(environment: OperatorEnvironment) {
        const changes: OperatorStateChange[] = []
        for (const worker of Object.values(this.templateBuilders)) {
            const change: OperatorStateChange = {
                title: worker.title,
                priorStatus: worker.status,
                newStatus: worker.status
            }
            if (worker.status === "stopped") {
                await worker.start()
                environment.toggleStatus(worker.title, "started")
                change.newStatus = "started"
            }
            changes.push(change)
        }

        return changes
    }

    async stopAll(environment: OperatorEnvironment) {
        const changes: OperatorStateChange[] = []
        for (const worker of Object.values(this.templateBuilders)) {
            const change: OperatorStateChange = {
                title: worker.title,
                priorStatus: worker.status,
                newStatus: worker.status
            }
            if (worker.status === "started") {
                await worker.shutdown()
                environment.toggleStatus(worker.title, "stopped")
                change.newStatus = "stopped"
            }
            changes.push(change)
        }

        return changes
    }

    status(_environment: OperatorEnvironment): ResourceAndStatus[] {
        return Object.values(this.templateBuilders).map(a => ({resource: a.title, status: a.status} as ResourceAndStatus))
    }
}
