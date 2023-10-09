import {AgentDeploymentDescriptor, Deployment} from "@/kamparas/DeploymentDescriptor";
import {AutonomousQAManager, AutonomousSkilledWorker, AutonomousWorkerManager} from "@/praxeum/Worker";
import {OpenAILLM} from "@/kamparas/internal/OpenAILLM";
import {MongoMemory} from "@/kamparas/internal/MongoMemory";
import {AgentIdentifier} from "@/kamparas/Agent";
import {nanoid} from "nanoid";
import {getOrCreateSchemaManager} from "@/kamparas/SchemaManager";
import _ from "underscore";
import {RabbitAgentEnvironment} from "@/kamparas/internal/RabbitAgentEnvironment";

interface DescriptorAndIdentifier {
    identifier: AgentIdentifier
    descriptor: AgentDeploymentDescriptor
}

function descriptorToIdentifier(workerDescriptor: AgentDeploymentDescriptor) {
    return {
        identifier: {
            identifier: nanoid(),
            title: workerDescriptor.title,
            job_description: workerDescriptor.job_description,
            input_schema: getOrCreateSchemaManager().compile(JSON.parse(workerDescriptor.input_schema)),
            answer_schema: getOrCreateSchemaManager().compile(JSON.parse(workerDescriptor.output_schema)),
        } as AgentIdentifier,
        descriptor: workerDescriptor
    } as DescriptorAndIdentifier
}

export const startServer = (deployment: Deployment) => {
    const builtinWorkerIdentifiers: Record<string, DescriptorAndIdentifier> = _(deployment.skilled_workers.map(descriptorToIdentifier)).indexBy("title")
    const skilledWorkerIdentifiers: Record<string, DescriptorAndIdentifier> = _(deployment.skilled_workers.map(descriptorToIdentifier)).indexBy("title")
    const managerIdentifiers: Record<string, DescriptorAndIdentifier> = _(deployment.managers.map(descriptorToIdentifier)).indexBy("title")
    const qaIdentifiers: Record<string, DescriptorAndIdentifier> = _(deployment.managers.map(descriptorToIdentifier)).indexBy("title")

    const allTools = Object.values(builtinWorkerIdentifiers).map(i => i.identifier).concat(
        ...Object.values(skilledWorkerIdentifiers).map(i => i.identifier))

    Object.values(builtinWorkerIdentifiers).map(workerId => {
    })

    const workers = Object.values(skilledWorkerIdentifiers).map(workerId => {
        const llm = new OpenAILLM({})
        const memory = new MongoMemory(workerId.identifier)
        const environment = new RabbitAgentEnvironment()

        return new AutonomousSkilledWorker({
            ...workerId.identifier,
            llm: llm,
            memory: memory,
            environment: environment,
            model: workerId.descriptor.model,
            temperature: workerId.descriptor.temperature || 0.2,
            manager: managerIdentifiers[workerId.descriptor.manager!].identifier,
            qaManager: qaIdentifiers[workerId.descriptor.qaManager!].identifier,
            maxConcurrentThoughts: 5,
            availableTools: allTools
        })
    })

    const qaManagers = Object.values(qaIdentifiers).map(workerId => {
        const llm = new OpenAILLM({})
        const memory = new MongoMemory(workerId.identifier)
        const environment = new RabbitAgentEnvironment()

        return new AutonomousQAManager({
            ...workerId.identifier,
            llm: llm,
            memory: memory,
            environment: environment,
            model: workerId.descriptor.model,
            temperature: workerId.descriptor.temperature || 0.2,
            manager: managerIdentifiers[workerId.descriptor.manager!].identifier,
            maxConcurrentThoughts: 5,
            availableTools: allTools
        })
    })
    const managers = Object.values(managerIdentifiers).map(workerId => {
        const llm = new OpenAILLM({})
        const memory = new MongoMemory(workerId.identifier)
        const environment = new RabbitAgentEnvironment()

        return new AutonomousWorkerManager({
            ...workerId.identifier,
            llm: llm,
            memory: memory,
            environment: environment,
            model: workerId.descriptor.model,
            temperature: workerId.descriptor.temperature || 0.2,
            manager: workerId.descriptor.manager ? managerIdentifiers[workerId.descriptor.manager].identifier : undefined,
            maxConcurrentThoughts: 5,
            availableTools: allTools
        })
    })
}
