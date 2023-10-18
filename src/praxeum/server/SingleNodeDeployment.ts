import {BaseWorkerDescriptor, Resource, ResourceStatus} from "@/praxeum/server/DeploymentDescriptor";
import yaml from "yaml"
import YAML from "yaml"
import {rootLogger} from "@/util/RootLogger";
import {shutdownRabbit} from "@/kamparas/internal/RabbitMQ";
import {shutdownMongo} from "@/util/util";
import fs from "fs";
import {
    AgentTemplateOperator,
    AutonomousAgentOperator,
    CodeAgentOperator,
    MetaConceptOperator,
    Operator,
    OperatorEnvironment,
    ResourceAndStatus
} from "@/praxeum/server/Operator";
import {MongoRabbitPlatform} from "@/kamparas/internal/MongoRabbitPlatform"

class SingleNodeDeployment implements OperatorEnvironment {
    private readonly dataDir: string;
    private logger = rootLogger.child({type: "server"})
    private envBuilder = new MongoRabbitPlatform()
    private operators: Operator[] = [new AutonomousAgentOperator(this.envBuilder), new MetaConceptOperator(this.envBuilder), new CodeAgentOperator(this.envBuilder), new AgentTemplateOperator(this.envBuilder)]

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

    apply = async (data: string) => {
        const allDocs = yaml.parseAllDocuments(data)

        const resourcesToApply: Resource[] = allDocs.map(doc => {
            return doc?.toJSON() as Resource
        }).filter(x => x != null).map(x => x!)

        const resourcesNotMapped: Resource[] = []
        for (const resource of resourcesToApply) {
            let processed = false
            for (const operator of this.operators) {
                processed ||= await operator.apply(resource, this)
            }
            if (!processed) {
                resourcesNotMapped.push(resource)
            }
        }

        if (resourcesNotMapped.length > 0) {
            this.logger.error(`The following resources do not have an operator:\n${resourcesNotMapped.map(x => x.title).join("\n")}`)
        }

        let message = `${resourcesToApply.length - resourcesNotMapped.length} workers applied`;
        this.logger.info(message)

        return message
    }

    writeResource(descriptor: Resource) {
        if (!descriptor?.title) {
            this.logger.error(`Cannot write resource ${JSON.stringify(descriptor)}`)
        } else {
            fs.writeFileSync(`${this.dataDir}/${descriptor.title}.yaml`, YAML.stringify(descriptor))
        }
    }

    deleteResource(title: string) {
        this.logger.info(`Deleted descriptor ${title}`)
        fs.rmSync(`${this.dataDir}/${title}.yaml`)
    }

    private readDescriptor(title: string): BaseWorkerDescriptor {
        const contentsStr = fs.readFileSync(`${this.dataDir}/${title}.yaml`).toString("utf-8")
        return YAML.parse(contentsStr) as BaseWorkerDescriptor
    }

    toggleStatus(title: string, status: ResourceStatus): void {
        const descriptor = this.readDescriptor(title)
        descriptor.status = status
        this.writeResource(descriptor)
    }

    async start() {
        const jobs = {
            started: [] as string[],
            alreadyStarted: [] as string[],
        }

        const stateChanges = (await Promise.all(this.operators.map(op => op.startAll(this)))).flat()
        stateChanges.forEach(change => {
            if (change.newStatus === change.priorStatus) {
                jobs.alreadyStarted.push(change.title)
            } else {
                jobs.started.push(change.title)
            }
        })

        return jobs
    }

    async stop() {
        const stateChanges = (await Promise.all(this.operators.map(op => op.stopAll(this)))).flat()
        await shutdownRabbit()
        await shutdownMongo()

        return `${stateChanges.length} workers stopped`
    }

    status(): ResourceAndStatus[] {
        return this.operators.map(op => op.status(this)).flat()
    }
}

let singleNodeDeployment: SingleNodeDeployment

export function startSingleNodeServer(dataDir: string): SingleNodeDeployment {
    if (!singleNodeDeployment) {
        singleNodeDeployment = new SingleNodeDeployment(dataDir)
    }
    return singleNodeDeployment
}

export function getSingleNodeDeployment() {
    return singleNodeDeployment
}
