import {
    AgentIdentifier,
    AgentTool,
    AutonomousAgent,
    AutonomousAgentOptions,
    BuiltinAgent,
    localAgentCall
} from "@/kamparas/Agent";
import {EventContent} from "@/kamparas/Environment";
import {DateTime} from "luxon";

export interface WorkerOptions extends AutonomousAgentOptions {
}
export interface SkilledWorkerOptions extends WorkerOptions {
    manager: AgentIdentifier
    qaManager: AgentIdentifier
}
export interface WorkerManagerOptions extends WorkerOptions {
    manager?: AgentIdentifier
}
export interface QAManagerOptions extends WorkerOptions {
    manager: AgentIdentifier
}

export interface Worker {
}

export interface WorkerManager extends Worker {
    manager?: AgentIdentifier

}

export interface QAManager extends Worker {
    manager: AgentIdentifier
}

export interface SkilledWorker extends Worker {
    manager: AgentIdentifier
    qaManager?: AgentIdentifier
}

export class BuiltinSkilledWorker extends BuiltinAgent {
    getLogType(): string {
        return "builtinWorker"
    }
}

export const ask_manager_tool = {
    title: "ask_manager",
    job_description: "Ask your manager for help regarding something you aren't sure, a missing tool, or anything you need more information on",
} as AgentTool

abstract class AutonomousWorker extends AutonomousAgent {
    manager?: AgentIdentifier

    protected constructor(options: AutonomousAgentOptions) {
        super(options);
    }

    async initialize(): Promise<void> {
        await super.initialize();
        if (this.manager) {
            this.availableHelpers[ask_manager_tool.title] = localAgentCall({...ask_manager_tool, input_schema: this.manager.input_schema}, this.askManager.bind(this))
        }
    }

    async askManager(conversationId: string, requestId: string, content: EventContent) {
        const remoteTitle: string = this.manager!.title
        await this.memory.recordEpisodicEvent({
            actor: "worker",
            type: "help",
            conversation_id: conversationId,
            timestamp: DateTime.now().toISO()!,
            content: {
                tool_name: remoteTitle,
                arguments: content
            }
        })
        this.logger.info(`Asking help from ${remoteTitle}`, {conversation_id: conversationId})
        // noinspection ES6MissingAwait
        this.environment.askForHelp(this.title, this.identifier, conversationId, remoteTitle, requestId, content)
        return Promise.resolve()
    }
}

export class AutonomousSkilledWorker extends AutonomousWorker implements SkilledWorker {
    manager: AgentIdentifier
    qaManager: AgentIdentifier

    constructor(options: SkilledWorkerOptions) {
        super(options);
        this.manager = options.manager
        this.qaManager = options.qaManager
    }

    getLogType(): string {
        return "skilledWorker"
    }
}

export class AutonomousWorkerManager extends AutonomousWorker implements WorkerManager {
    manager?: AgentIdentifier

    constructor(options: WorkerManagerOptions) {
        super(options);
        this.manager = options.manager
    }

    getLogType(): string {
        return "manager"
    }
}

export class AutonomousQAManager extends AutonomousWorker implements QAManager {
    manager: AgentIdentifier

    constructor(options: QAManagerOptions) {
        super(options);
        this.manager = options.manager
    }

    getLogType(): string {
        return "qaManager"
    }
}
