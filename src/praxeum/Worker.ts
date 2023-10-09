import {AgentIdentifier, AgentOptions, AutonomousAgent, BuiltinAgent} from "@/kamparas/Agent";

export interface WorkerOptions extends AgentOptions {
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

export class BuiltinSkilledWorker<T, U> extends BuiltinAgent<T, U> {
}

export class AutonomousSkilledWorker extends AutonomousAgent implements SkilledWorker {
    manager: AgentIdentifier
    qaManager: AgentIdentifier

    constructor(options: SkilledWorkerOptions) {
        super(options);
        this.manager = options.manager
        this.qaManager = options.qaManager
    }
}

export class AutonomousWorkerManager extends AutonomousAgent implements WorkerManager {
    manager?: AgentIdentifier

    constructor(options: WorkerManagerOptions) {
        super(options);
        this.manager = options.manager
    }
}

export class AutonomousQAManager extends AutonomousAgent implements QAManager {
    manager: AgentIdentifier

    constructor(options: QAManagerOptions) {
        super(options);
        this.manager = options.manager
    }
}
