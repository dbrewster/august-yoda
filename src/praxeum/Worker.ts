import {
    AgentIdentifier,
    AutonomousAgent,
    AutonomousAgentOptions,
    BuiltinAgent,
    remoteAgentCall
} from "@/kamparas/Agent";

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

abstract class AutonomousWorker extends AutonomousAgent {
    manager?: AgentIdentifier

    protected constructor(options: AutonomousAgentOptions) {
        super(options);
    }

    async initialize(): Promise<void> {
        await super.initialize();
        if (this.manager) {
            this.availableHelpers[this.manager.title] = remoteAgentCall(this.manager)
        }
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
