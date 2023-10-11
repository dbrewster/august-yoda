import {AgentIdentifier, AutonomousAgent, AutonomousAgentOptions, BuiltinAgent} from "@/kamparas/Agent";
import {DirectMessage, TitleMessage} from "@/kamparas/internal/RabbitAgentEnvironment";

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

export class AutonomousSkilledWorker extends AutonomousAgent implements SkilledWorker {
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

    processDecodeError(type: "direct" | "instruction", message: string) {
        super.processDecodeError(type, message);
    }

    processDirectMessageError(directMessage: DirectMessage, error: any) {
        super.processDirectMessageError(directMessage, error);
    }

    processTitleMessageError(message: TitleMessage, error: any) {
        super.processTitleMessageError(message, error);
    }
}

export class AutonomousWorkerManager extends AutonomousAgent implements WorkerManager {
    manager?: AgentIdentifier

    constructor(options: WorkerManagerOptions) {
        super(options);
        this.manager = options.manager
    }

    getLogType(): string {
        return "manager"
    }
}

export class AutonomousQAManager extends AutonomousAgent implements QAManager {
    manager: AgentIdentifier

    constructor(options: QAManagerOptions) {
        super(options);
        this.manager = options.manager
    }

    getLogType(): string {
        return "qaManager"
    }
}
