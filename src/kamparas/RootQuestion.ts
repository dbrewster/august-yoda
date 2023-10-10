import {AgentEnvironment, EnvironmentHandler, NewTaskInstruction} from "@/kamparas/Environment";
import {DirectMessage, HelpMessageResponse, TitleMessage} from "@/kamparas/internal/RabbitAgentEnvironment";
import {ValidateFunction} from "ajv";
import {z} from "zod";
import {nanoid} from "nanoid";
import {getOrCreateSchemaManager} from "@/kamparas/SchemaManager";
import {rootLogger} from "@/util/RootLogger";
import {Logger} from "winston";

export class RootQuestion implements EnvironmentHandler {
    title: string = "RootQuestion"
    job_description: string = ""
    identifier: string
    inputSchema: ValidateFunction<any>;
    private logger: Logger;
    private requests: Record<string, {resolve: (result:any) => any, reject: (result: any) => any}> = {}
    private environment: AgentEnvironment;

    constructor(environment: AgentEnvironment) {
        this.environment = environment;
        this.identifier = nanoid()
        this.inputSchema = getOrCreateSchemaManager().compileZod(z.object({question: z.string()}))
        this.logger = rootLogger.child({type: "question", title: this.title, identifier: this.identifier})
    }

    async initialize() {
        this.environment.setLogger(this.logger.child({subType: "environment"}))
        await this.environment.registerHandler(this)
    }

    async askQuestion(agentTitle: string, data: Record<string, any>) {
        if (!this.environment.logger) {
            this.logger.crit("WTH -- environment not initialized")
        }
        const taskId = nanoid()
        const requestId = nanoid()
        const responsePromise = new Promise<any>((resolve, reject) => {
            this.requests[taskId] = {resolve, reject}
        })
        if (this.logger.isDebugEnabled()) {
            this.logger.debug(`Asking question of ${agentTitle} -- ${JSON.stringify(data)}`)
        }
        await this.environment.askForHelp(this.title, this.identifier, taskId, agentTitle, requestId, data)
        return responsePromise.finally(() => {
            delete this.requests[taskId]
        })
    }

    async processDirectMessage(message: DirectMessage): Promise<void> {
        if (message.type == "help_response") {
            const response = message.contents as HelpMessageResponse
            if (!this.requests[response.task_id]) {
                this.logger.error(`Could not find task id in question response object ${response.task_id} in [${Object.keys(this.requests).join(",")}]`)
            }
            const promiseFn = this.requests[response.task_id]
            promiseFn.resolve(response.response)
        } else {
            this.logger.error(`huh??? got message ${JSON.stringify(message)}`)
        }
        return Promise.resolve()
    }

    processInstruction(instruction: NewTaskInstruction): Promise<void> {
        return Promise.resolve();
    }

    processDecodeError(type: "direct" | "instruction", message: string): void {
        this.logger.error(`decode error ${type}: ${message}`)
    }

    processDirectMessageError(directMessage: DirectMessage, error: any): void {
        this.logger.error(`direct message error ${JSON.stringify(directMessage)}: ${JSON.stringify(error)}`)
    }

    processTitleMessageError(message: TitleMessage, error: any): void {
        this.logger.error(`title message error ${JSON.stringify(message)}: ${JSON.stringify(error)}`)
    }
}
