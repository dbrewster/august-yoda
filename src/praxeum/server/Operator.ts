import {deleteIdentifier, registerIdentifier,} from "@/kamparas/AgentRegistry";
import {
    AutonomousQAManager,
    AutonomousSkilledWorker,
    AutonomousWorker,
    AutonomousWorkerManager
} from "@/praxeum/Worker";
import _ from "underscore"
import {
    AutonomousAgentDescriptor,
    AutonomousWorkerDescriptor, CodeAgentDescriptor,
    ManagerDescriptor,
    QAManagerDescriptor,
    Resource,
    ResourceStatus, ResourceType,
    SkilledWorkerDescriptor
} from "@/praxeum/server/DeploymentDescriptor";
import {RabbitAgentEnvironment} from "@/kamparas/internal/RabbitAgentEnvironment";
import {makeLLM} from "@/kamparas/internal/LLMRegistry";
import {MongoMemory} from "@/kamparas/internal/MongoMemory";
import {rootLogger} from "@/util/RootLogger";
import {getOrCreateSchemaManager} from "@/kamparas/SchemaManager";
import {Agent, AgentIdentifier} from "@/kamparas/Agent";
import {CodeAgent, CodeAgentOptions} from "@/kamparas/CodeAgent";

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
    abstract operatorResourceType: ResourceType

    existingAgents: Record<string, Agent> = {}
    logger = rootLogger.child({type: "agent-operator"})

    protected abstract makeWorker(resource: Resource): Promise<Agent>

    protected descriptorToIdentifier<T extends AutonomousAgentDescriptor>(workerDescriptor: T) {
        return {
            identifier: workerDescriptor.identifier,
            title: workerDescriptor.title,
            job_description: workerDescriptor.job_description,
            input_schema: getOrCreateSchemaManager().compile(JSON.stringify(workerDescriptor.input_schema)),
            answer_schema: getOrCreateSchemaManager().compile(JSON.stringify(workerDescriptor.output_schema)),
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
                        let agent = await this.makeWorker(resource);
                        agent.initialize(new MongoMemory(agent.agent_identifier), new RabbitAgentEnvironment())

                        this.existingAgents[resource.title] = agent
                    }

                    environment.writeResource(resource)
                } else {
                    this.logger.info(`Agent ${resource.title} unchanged`)
                }
            } else {
                let agent = await this.makeWorker(resource);
                agent.initialize(new MongoMemory(agent.agent_identifier), new RabbitAgentEnvironment())

                this.existingAgents[resource.title] = agent
                if (resource.status === "started") {
                    await agent.start()
                }
                environment.writeResource(resource)
            }
            registerIdentifier(this.existingAgents[resource.title].agent_identifier)
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
            deleteIdentifier(resource.title)
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
                const llm = makeLLM(descriptor.llm, descriptor.model, descriptor.temperature || 0.2)
                return new AutonomousSkilledWorker({
                    ...identifier,
                    llm: llm,
                    initial_plan: descriptor.initial_plan,
                    overwrite_plan: descriptor.overwrite_plan || process.env.OVERWRITE_PLAN === "true",
                    initial_plan_instructions: descriptor.initial_instructions,
                    overwrite_plan_instructions: descriptor.overwrite_plan_instructions || process.env.OVERWRITE_PLAN_INSTRUCTIONS === "true",
                    maxConcurrentThoughts: descriptor.max_thoughts || 5,
                    availableTools: descriptor.available_tools,
                    manager: descriptor.manager,
                    qaManager: descriptor.qaManager,
                })
            }
            case "Manager": {
                const descriptor = agentDescriptor as ManagerDescriptor
                const llm = makeLLM(descriptor.llm, descriptor.model, descriptor.temperature || 0.2)
                return new AutonomousWorkerManager({
                    ...identifier,
                    llm: llm,
                    initial_plan: descriptor.initial_plan,
                    overwrite_plan: descriptor.overwrite_plan || process.env.OVERWRITE_PLAN === "true",
                    initial_plan_instructions: descriptor.initial_instructions,
                    overwrite_plan_instructions: descriptor.overwrite_plan_instructions || process.env.OVERWRITE_PLAN_INSTRUCTIONS === "true",
                    maxConcurrentThoughts: descriptor.max_thoughts || 5,
                    availableTools: descriptor.available_tools,
                    manager: descriptor.manager
                })
            }

            case "QAManager": {
                const descriptor = agentDescriptor as QAManagerDescriptor
                const llm = makeLLM(descriptor.llm, descriptor.model, descriptor.temperature || 0.2)
                return new AutonomousQAManager({
                    ...identifier,
                    llm: llm,
                    initial_plan: descriptor.initial_plan,
                    overwrite_plan: descriptor.overwrite_plan || process.env.OVERWRITE_PLAN === "true",
                    initial_plan_instructions: descriptor.initial_instructions,
                    overwrite_plan_instructions: descriptor.overwrite_plan_instructions || process.env.OVERWRITE_PLAN_INSTRUCTIONS === "true",
                    maxConcurrentThoughts: descriptor.max_thoughts || 5,
                    availableTools: descriptor.available_tools,
                    manager: descriptor.manager,
                })
            }

            default:
                throw `Invalid agent type ${agentDescriptor.deployment_type} for ${JSON.stringify(agentDescriptor)}`
        }

    }


}

export class MetaConceptOperator extends Operator {
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
            deleteIdentifier(resource.title)
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
            title: resource.title
        }
        return new clazz(options)
    }
}
