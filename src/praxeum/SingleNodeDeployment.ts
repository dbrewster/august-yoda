import {
    BaseWorkerDescriptor,
    BuiltinWorkerDescriptor,
    Deployment,
    ManagerDescriptor,
    QAManagerDescriptor,
    SkilledWorkerDescriptor
} from "@/praxeum/DeploymentDescriptor";
import {
    AutonomousQAManager,
    AutonomousSkilledWorker,
    AutonomousWorkerManager,
    BuiltinSkilledWorker
} from "@/praxeum/Worker";
import {MongoMemory} from "@/kamparas/internal/MongoMemory";
import {AgentIdentifier} from "@/kamparas/Agent";
import {getOrCreateSchemaManager} from "@/kamparas/SchemaManager";
import _ from "underscore";
import {RabbitAgentEnvironment} from "@/kamparas/internal/RabbitAgentEnvironment";
import yaml from "yaml"
import fs from "node:fs";
import {rootLogger} from "@/util/RootLogger";
import {builtinFunctions} from "@/praxeum/BuiltinFunctions";
import {makeLLM} from "@/kamparas/internal/LLMRegistry";

interface DescriptorAndIdentifier<T extends BaseWorkerDescriptor> {
    identifier: AgentIdentifier
    descriptor: T
}

function descriptorToIdentifier<T extends BaseWorkerDescriptor>(workerDescriptor: T) {
    return {
        identifier: {
            identifier: workerDescriptor.identifier,
            title: workerDescriptor.title,
            job_description: workerDescriptor.job_description,
            input_schema: getOrCreateSchemaManager().compile(JSON.stringify(workerDescriptor.input_schema)),
            answer_schema: getOrCreateSchemaManager().compile(JSON.stringify(workerDescriptor.output_schema)),
        } as AgentIdentifier,
        descriptor: workerDescriptor
    } as DescriptorAndIdentifier<T>
}

export let allToolIdentifiers: Record<string, DescriptorAndIdentifier<any>> = {}

export const startServer = async (yamlFileLocation: string) => {
    const file = fs.readFileSync(yamlFileLocation, "utf-8")
    const deployment = yaml.parse(file) as Deployment

    const builtinWorkerIdentifiers: Record<string, DescriptorAndIdentifier<BuiltinWorkerDescriptor>> = _(deployment.builtin_workers.map(descriptorToIdentifier)).indexBy((x) => x.identifier.title)
    const skilledWorkerIdentifiers: Record<string, DescriptorAndIdentifier<SkilledWorkerDescriptor>> = _(deployment.skilled_workers.map(descriptorToIdentifier)).indexBy((x) => x.identifier.title)
    const managerIdentifiers: Record<string, DescriptorAndIdentifier<ManagerDescriptor>> = _(deployment.managers.map(descriptorToIdentifier)).indexBy((x) => x.identifier.title)
    const qaIdentifiers: Record<string, DescriptorAndIdentifier<QAManagerDescriptor>> = _(deployment.qa_managers.map(descriptorToIdentifier)).indexBy((x) => x.identifier.title)

    allToolIdentifiers = {...builtinWorkerIdentifiers, ...skilledWorkerIdentifiers}

    const builtinWorkers = Object.values(builtinWorkerIdentifiers).map(workerId => {
        const environment = new RabbitAgentEnvironment()
        const fn = builtinFunctions[workerId.descriptor.function_name]
        return new BuiltinSkilledWorker({
            ...workerId.identifier,
            environment: environment,
        }, fn)
    })

    const skilledWorkers: AutonomousSkilledWorker[] = []
    for (const workerId of Object.values(skilledWorkerIdentifiers)) {
        const llm = makeLLM(workerId.descriptor.llm)
        const memory = new MongoMemory(workerId.identifier)
        const environment = new RabbitAgentEnvironment()

        console.log(Object.keys(managerIdentifiers))
        const manager = managerIdentifiers[workerId.descriptor.manager]
        const qaManager = qaIdentifiers[workerId.descriptor.qaManager]
        await memory.recordPlan(workerId.descriptor.initial_plan)
        await memory.recordPlanInstructions(workerId.descriptor.initial_instructions)
        skilledWorkers.push(new AutonomousSkilledWorker({
            ...workerId.identifier,
            llm: llm,
            memory: memory,
            environment: environment,
            model: workerId.descriptor.model,
            temperature: workerId.descriptor.temperature || 0.2,
            manager: manager.identifier,
            qaManager: qaManager.identifier,
            maxConcurrentThoughts: 5,
            availableTools: workerId.descriptor.available_tools.map(t => allToolIdentifiers[t].identifier)
        }))
    }

    const qaManagers: AutonomousQAManager[] = []
    for (const workerId of Object.values(qaIdentifiers)) {
        const llm = makeLLM(workerId.descriptor.llm)
        const memory = new MongoMemory(workerId.identifier)
        const environment = new RabbitAgentEnvironment()

        await memory.recordPlan(workerId.descriptor.initial_plan)
        await memory.recordPlanInstructions(workerId.descriptor.initial_instructions)
        const manager = managerIdentifiers[workerId.descriptor.manager]
        qaManagers.push(new AutonomousQAManager({
            ...workerId.identifier,
            llm: llm,
            memory: memory,
            environment: environment,
            model: workerId.descriptor.model,
            temperature: workerId.descriptor.temperature || 0.2,
            manager: manager.identifier,
            maxConcurrentThoughts: 5,
            availableTools: workerId.descriptor.available_tools.map(t => allToolIdentifiers[t].identifier)
        }))
    }

    const managers: AutonomousWorkerManager[] = []
    for (const workerId of Object.values(managerIdentifiers)) {
        const llm = makeLLM(workerId.descriptor.llm)
        const memory = new MongoMemory(workerId.identifier)
        const environment = new RabbitAgentEnvironment()
        await memory.recordPlan(workerId.descriptor.initial_plan)
        await memory.recordPlanInstructions(workerId.descriptor.initial_instructions)

        managers.push(new AutonomousWorkerManager({
            ...workerId.identifier,
            llm: llm,
            memory: memory,
            environment: environment,
            model: workerId.descriptor.model,
            temperature: workerId.descriptor.temperature || 0.2,
            manager: workerId.descriptor.manager ? managerIdentifiers[workerId.descriptor.manager].identifier : undefined,
            maxConcurrentThoughts: 5,
            availableTools: workerId.descriptor.available_tools.map(t => allToolIdentifiers[t].identifier)
        }))
    }

    for (const worker of builtinWorkers) {
        await worker.initialize()
    }

    for (const worker of skilledWorkers) {
        await worker.initialize()
    }

    for (const worker of qaManagers) {
        await worker.initialize()
    }

    for (const worker of managers) {
        await worker.initialize()
    }
    rootLogger.info("Server started", {type: "server"})
}
