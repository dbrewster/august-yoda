import {LLMType, ModelType} from "@/kamparas/LLM";


// todo, builtin worker does not use concepts of other tools or num to start. Should probably be own interface
export interface BuiltinWorkerDescriptor extends BaseWorkerDescriptor {
    function_name: string
}

export interface AutonomousWorkerDescriptor extends BaseWorkerDescriptor {
    overwrite_plan: boolean,
    initial_plan: string,
    overwrite_plan_instructions: boolean
    initial_instructions: string,
    llm: LLMType
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

export type DescriptorType = ("BuiltinFunction" | "SkilledWorker" | "Manager" | "QAManager")

export type DescriptorStatus = ("started" | "stopped")

export interface BaseWorkerDescriptor {
    kind: DescriptorType
    title: string,
    status: DescriptorStatus,
    identifier: string,
    job_description: string,
    input_schema: Record<string, any>
    output_schema: Record<string, any>
    num_to_start: number
    available_tools: string[]
}
