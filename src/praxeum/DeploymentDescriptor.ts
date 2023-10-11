import {ModelType} from "@/kamparas/LLM";


// todo, builtin worker does not use concepts of other tools or num to start. Should probably be own interface
export interface BuiltinWorkerDescriptor extends BaseWorkerDescriptor {
    function_name: string
}

export interface AutonomousWorkerDescriptor extends BaseWorkerDescriptor {
    initial_plan: string,
    initial_instructions: string,
    model: ModelType
    temperature?: number
}

export  interface SkilledWorkerDescriptor extends AutonomousWorkerDescriptor {
    manager: string
    qaManager: string
}

export  interface ManagerDescriptor extends AutonomousWorkerDescriptor {
    manager?: string
}

export  interface QAManagerDescriptor extends AutonomousWorkerDescriptor {
    manager: string
}

export interface BaseWorkerDescriptor {
    title: string,
    identifier: string,
    job_description: string,
    input_schema: Record<string, any>
    output_schema: Record<string, any>
    num_to_start: number
    available_tools: string[]
}

export interface Deployment {
    name: string,
    builtin_workers: BuiltinWorkerDescriptor[]
    skilled_workers: SkilledWorkerDescriptor[]
    managers: ManagerDescriptor[]
    qa_managers: QAManagerDescriptor[]
}
