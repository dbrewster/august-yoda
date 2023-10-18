import {HelpResponse, NewTaskInstruction} from "@/kamparas/Environment";
import {DirectMessage} from "@/kamparas/internal/RabbitAgentEnvironment";
import {z} from "zod";
import {nanoid} from "nanoid";
import {getOrCreateSchemaManager} from "@/kamparas/SchemaManager";
import {Agent} from "@/kamparas/Agent";

export class RootQuestion extends Agent {
    private requests: Record<string, {resolve: (result:any) => any, reject: (result: any) => any}> = {}

    constructor() {
        super({
            title: "RootQuestion",
            job_description: "",
            identifier: nanoid(),
            input_schema: getOrCreateSchemaManager().compileZod(z.object({question: z.string()})),
            answer_schema: getOrCreateSchemaManager().compileZod(z.object({answer: z.string()})),
        })
    }

    async start() {
        this.environment.setLogger(this.logger.child({subType: "environment"}))
        await this.environment.registerHandler(this)
    }

    async askQuestion(agentTitle: string, data: Record<string, any>) {
        if (!this.environment.logger) {
            this.logger.error("WTH -- environment not initialized")
        }
        const conversationId = nanoid()
        const requestId = nanoid()
        const responsePromise = new Promise<any>((resolve, reject) => {
            this.requests[conversationId] = {resolve, reject}
        })
        if (this.logger.isDebugEnabled()) {
            this.logger.debug(`Asking question of ${agentTitle} -- ${JSON.stringify(data)}`, {conversation_id: conversationId})
        }
        this.logger.info(`Asking help from ${agentTitle} (request_id ${requestId})`, {conversation_id: conversationId})
        await this.environment.askForHelp(this.title, this.identifier, conversationId, agentTitle, requestId, {}, data)
        return responsePromise.finally(() => {
            delete this.requests[conversationId]
        })
    }

    async processDirectMessage(message: DirectMessage): Promise<void> {
        if (message.type == "help_response") {
            const response = message.contents as HelpResponse
            if (!this.requests[response.conversation_id]) {
                this.logger.error(`Could not find task id in question response object ${response.conversation_id} in [${Object.keys(this.requests).join(",")}]`, {conversation_id: response.conversation_id})
            }
            const promiseFn = this.requests[response.conversation_id]
            promiseFn.resolve(response.response)
        } else {
            this.logger.error(`huh??? got message ${JSON.stringify(message)}`)
        }
        return Promise.resolve()
    }

    processInstruction(instruction: NewTaskInstruction): Promise<void> {
        return Promise.resolve();
    }
}
