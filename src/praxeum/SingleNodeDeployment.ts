import {
    BaseWorkerDescriptor,
    BuiltinWorkerDescriptor,
    DescriptorStatus,
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
import {Agent, AgentIdentifier, AgentStatus} from "@/kamparas/Agent";
import {getOrCreateSchemaManager} from "@/kamparas/SchemaManager";
import {RabbitAgentEnvironment} from "@/kamparas/internal/RabbitAgentEnvironment";
import yaml from "yaml"
import {rootLogger} from "@/util/RootLogger";
import {builtinFunctions} from "@/praxeum/BuiltinFunctions";
import {makeLLM} from "@/kamparas/internal/LLMRegistry";
import {shutdownRabbit} from "@/kamparas/internal/RabbitMQ";
import {shutdownMongo} from "@/util/util";
import fs from "fs";
import {captureRejectionSymbol} from "ws";
import YAML from "yaml";

interface WorkerInstance {
    identifier: AgentIdentifier
    descriptor: BaseWorkerDescriptor
    worker?: Agent
}

class SingleNodeDeployment {
    private readonly dataDir: string;

    constructor(dataDir: string) {
        this.dataDir = dataDir
    }

    async initialize() {
        let allFiles
        try {
            allFiles = fs.readdirSync(this.dataDir);
        } catch {
            console.log("making data dir " + this.dataDir)
            fs.mkdirSync(this.dataDir)
            allFiles = fs.readdirSync(this.dataDir);
        }

        const filesToRead = allFiles.filter(f => f.endsWith(".yaml"))
        let fileContents = ""
        for (const f of filesToRead) {
            const contents = fs.readFileSync(`${this.dataDir}/${f}`)
            fileContents += contents.toString("utf-8") + "\n---\n"
        }
        console.log(await this.apply(fileContents))
    }

    descriptorToIdentifier<T extends BaseWorkerDescriptor>(workerDescriptor: T) {
        return {
            identifier: workerDescriptor.identifier,
            title: workerDescriptor.title,
            job_description: workerDescriptor.job_description,
            input_schema: getOrCreateSchemaManager().compile(JSON.stringify(workerDescriptor.input_schema)),
            answer_schema: getOrCreateSchemaManager().compile(JSON.stringify(workerDescriptor.output_schema)),
        } as AgentIdentifier
    }

    allInstances: Record<string, WorkerInstance> = {}

    apply = async (data: string) => {
        const allDocs = yaml.parseAllDocuments(data)
        const descriptors = allDocs.map(doc => {
            // todo -- validate descriptor
            return doc?.toJSON() as BaseWorkerDescriptor
        }).filter(x => x != null).map(x => x!)

        for (const descriptor of descriptors) {
            if (this.allInstances[descriptor.title] && this.allInstances[descriptor.title].worker) {
                rootLogger.info(`Stopping worker ${descriptor.title}`)
                await this.allInstances[descriptor.title].worker!.shutdown()
            }
        }

        // apply descriptors
        descriptors.forEach(descriptor => {
            if (descriptor) {
                this.allInstances[descriptor.title] = {
                    identifier: this.descriptorToIdentifier(descriptor),
                    descriptor: descriptor
                } as WorkerInstance
            }
        })

        const missing = Object.values(this.allInstances).flatMap(wi => {
            let deps = wi.descriptor.available_tools;
            if ('manager' in wi.descriptor && wi.descriptor.manager) {
                deps.push(wi.descriptor.manager as string)
            }
            if ('qaManager' in wi.descriptor && wi.descriptor.qaManager) {
                deps.push(wi.descriptor.qaManager as string)
            }
            return deps
        }).filter(i => !(i in this.allInstances))
        if (missing.length > 0) {
            rootLogger.error(`Missing referenced objects ${missing}`)
            throw Error(`Missing referenced objects ${missing}`)
        }


        Object.values(this.allInstances).forEach(workerInstance => {
            rootLogger.info(`processing ${workerInstance.identifier.title}`)
            switch (workerInstance.descriptor.kind) {
                case "BuiltinFunction": {
                    const descriptor = workerInstance.descriptor as BuiltinWorkerDescriptor
                    const identifier = workerInstance.identifier
                    const environment = new RabbitAgentEnvironment()
                    const fn = builtinFunctions[descriptor.function_name]
                    workerInstance.worker = new BuiltinSkilledWorker({
                        ...identifier,
                        environment: environment,
                    }, fn)
                    break
                }
                case "SkilledWorker": {
                    const descriptor = workerInstance.descriptor as SkilledWorkerDescriptor
                    const identifier = workerInstance.identifier
                    const llm = makeLLM(descriptor.llm, descriptor.model, descriptor.temperature || 0.2)
                    const memory = new MongoMemory(identifier)
                    const environment = new RabbitAgentEnvironment()
                    workerInstance.worker = new AutonomousSkilledWorker({
                        ...identifier,
                        llm: llm,
                        memory: memory,
                        environment: environment,
                        initial_plan: descriptor.initial_plan,
                        overwrite_plan: descriptor.overwrite_plan || process.env.OVERWRITE_PLAN === "true",
                        initial_plan_instructions: descriptor.initial_instructions,
                        overwrite_plan_instructions: descriptor.overwrite_plan_instructions || process.env.OVERWRITE_PLAN_INSTRUCTIONS === "true",
                        maxConcurrentThoughts: 5,
                        availableTools: descriptor.available_tools.map(t => this.allInstances[t].identifier),
                        manager: this.allInstances[descriptor.manager].identifier,
                        qaManager: this.allInstances[descriptor.qaManager].identifier,
                    })
                    break
                }
                case "Manager": {
                    const descriptor = workerInstance.descriptor as ManagerDescriptor
                    const identifier = workerInstance.identifier
                    const llm = makeLLM(descriptor.llm, descriptor.model, descriptor.temperature || 0.2)
                    const memory = new MongoMemory(identifier)
                    const environment = new RabbitAgentEnvironment()
                    workerInstance.worker = new AutonomousWorkerManager({
                        ...identifier,
                        llm: llm,
                        memory: memory,
                        environment: environment,
                        initial_plan: descriptor.initial_plan,
                        overwrite_plan: descriptor.overwrite_plan || process.env.OVERWRITE_PLAN === "true",
                        initial_plan_instructions: descriptor.initial_instructions,
                        overwrite_plan_instructions: descriptor.overwrite_plan_instructions || process.env.OVERWRITE_PLAN_INSTRUCTIONS === "true",
                        maxConcurrentThoughts: 5,
                        availableTools: descriptor.available_tools.map(t => this.allInstances[t].identifier),
                        manager: descriptor.manager ? this.allInstances[descriptor.manager].identifier : undefined
                    })
                    break
                }

                case "QAManager": {
                    const descriptor = workerInstance.descriptor as QAManagerDescriptor
                    const identifier = workerInstance.identifier
                    const llm = makeLLM(descriptor.llm, descriptor.model, descriptor.temperature || 0.2)
                    const memory = new MongoMemory(identifier)
                    const environment = new RabbitAgentEnvironment()
                    workerInstance.worker = new AutonomousQAManager({
                        ...identifier,
                        llm: llm,
                        memory: memory,
                        environment: environment,
                        initial_plan: descriptor.initial_plan,
                        overwrite_plan: descriptor.overwrite_plan || process.env.OVERWRITE_PLAN === "true",
                        initial_plan_instructions: descriptor.initial_instructions,
                        overwrite_plan_instructions: descriptor.overwrite_plan_instructions || process.env.OVERWRITE_PLAN_INSTRUCTIONS === "true",
                        maxConcurrentThoughts: 5,
                        availableTools: descriptor.available_tools.map(t => this.allInstances[t].identifier),
                        manager: this.allInstances[descriptor.manager].identifier,
                    })
                    break
                }
            }

            this.writeDescriptor(workerInstance.descriptor)
        })

        // now start them up
        let numStarted = 0
        for (const workerInstance of Object.values(this.allInstances)) {
            if (workerInstance.descriptor.status === "started") {
                await workerInstance.worker!.start()
                ++numStarted
            }
        }
        let message = `${numStarted} workers started\n${Object.values(this.allInstances).length - numStarted} awaiting start`;
        rootLogger.info(message, {type: "server"})

        return message
    }

    private writeDescriptor(descriptor: BaseWorkerDescriptor) {
        fs.writeFileSync(`${this.dataDir}/${descriptor.title}.yaml`, YAML.stringify(descriptor))
    }

    private readDescriptor(title: string): BaseWorkerDescriptor {
        const contentsStr = fs.readFileSync(`${this.dataDir}/${title}.yaml`).toString("utf-8")
        return YAML.parse(contentsStr) as BaseWorkerDescriptor
    }

    private toggleWorkerStatusOnDisk(title: string, newState: DescriptorStatus) {
        const descriptor = this.readDescriptor(title)
        if (descriptor.status != newState) {
            descriptor.status = newState
            this.writeDescriptor(descriptor)
        }
    }

    async start(agent_identifiers: string[] | undefined) {
        const jobs = {
            toStart: [] as string[],
            started: [] as string[],
            doesNotExist: [] as string[]
        }
        if (agent_identifiers) {
            for (const agent of agent_identifiers) {
                if (!this.allInstances[agent]) {
                    jobs.doesNotExist.push()
                } else if (this.allInstances[agent].worker!.status == "started") {
                    jobs.started.push(this.allInstances[agent].worker!.title)
                } else {
                    await this.allInstances[agent].worker!.start()
                    this.toggleWorkerStatusOnDisk(this.allInstances[agent].identifier.title, "started")
                    jobs.toStart.push(this.allInstances[agent].worker!.title)
                }
            }
        } else {
            for (const agent of Object.values(this.allInstances)) {
                if (agent.worker!.status === "started") {
                    jobs.started.push(agent.worker!.title)
                } else {
                    await agent.worker!.start()
                    this.toggleWorkerStatusOnDisk(agent.identifier.title, "started")
                    jobs.toStart.push(agent.worker!.title)
                }
            }
        }
        return jobs
    }

    async stop() {
        for (const workerInstance of Object.values(this.allInstances)) {
            await workerInstance.worker!.shutdown()
            this.toggleWorkerStatusOnDisk(workerInstance.identifier.title, "stopped")
        }
        await shutdownRabbit()
        await shutdownMongo()

        return `${Object.values(this.allInstances).length} workers stopped`
    }

    status(): WorkerStatus[] {
        return Object.values(this.allInstances).map(w => {
            const status = !w.worker ? "stopped" : w.worker.status
            return {
                identifier: w.identifier,
                status: status
            }
        })
    }
}

let singleNodeDeployment:SingleNodeDeployment

export function startSingleNodeServer(dataDir: string): SingleNodeDeployment {
    if (!singleNodeDeployment) {
        singleNodeDeployment = new SingleNodeDeployment(dataDir)
    }
    return singleNodeDeployment
}

export function getSingleNodeDeployment() {
    return singleNodeDeployment
}

export interface WorkerStatus {
    identifier: AgentIdentifier
    status: AgentStatus
}
