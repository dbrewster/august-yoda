import {AgentToolCall, AutonomousAgent, AutonomousAgentOptions, remoteAgentCall} from "@/kamparas/AutonomousAgent";

export interface WorkerOptions extends AutonomousAgentOptions {
}

export interface SkilledWorkerOptions extends WorkerOptions {
    manager: string
    qaManager: string
}

export interface WorkerManagerOptions extends WorkerOptions {
    manager?: string
}

export interface QAManagerOptions extends WorkerOptions {
    manager: string
}

export interface Worker {
}

export interface WorkerManager extends Worker {
    manager?: string

}

export interface QAManager extends Worker {
    manager: string
}

export interface SkilledWorker extends Worker {
    manager: string
    qaManager?: string
}

export abstract class AutonomousWorker extends AutonomousAgent {
    manager?: string

    protected constructor(options: AutonomousAgentOptions) {
        super(options);
    }

    async start(): Promise<void> {
        await super.start();
    }


    protected buildHelpers(): Record<string, AgentToolCall> {
        const retObject = {...super.buildHelpers()}
        if (this.manager) {
            retObject[this.manager] = remoteAgentCall(this.manager)
        }
        return retObject;
    }
}

export class AutonomousSkilledWorker extends AutonomousWorker implements SkilledWorker {
    manager: string
    qaManager: string

    constructor(options: SkilledWorkerOptions) {
        super(options);
        this.manager = options.manager
        this.qaManager = options.qaManager
    }

    getLogType(): string {
        return "skilledWorker"
    }

    protected buildHelpers(): Record<string, AgentToolCall> {
        const retObject = {...super.buildHelpers()}
        retObject[this.qaManager] = remoteAgentCall(this.qaManager)
        return retObject;
    }
}

export class AutonomousWorkerManager extends AutonomousWorker implements WorkerManager {
    manager?: string

    constructor(options: WorkerManagerOptions) {
        super(options);
        this.manager = options.manager
    }

    getLogType(): string {
        return "manager"
    }
}

export class AutonomousQAManager extends AutonomousWorker implements QAManager {
    manager: string

    constructor(options: QAManagerOptions) {
        super(options);
        this.manager = options.manager
    }

    getLogType(): string {
        return "qaManager"
    }
}
