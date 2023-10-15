import {LLMType, ModelType} from "@/kamparas/LLM";


// todo, builtin worker does not use concepts of other tools or num to start. Should probably be own interface
export interface BuiltinWorkerDescriptor extends BaseWorkerDescriptor {
    deployment_type: 'BuiltinFunction'
    function_name: string
}

export interface AutonomousWorkerDescriptor extends BaseWorkerDescriptor {
    overwrite_plan?: boolean,
    overwrite_plan_instructions?: boolean
    initial_plan: string,
    initial_instructions: string,
    llm: LLMType
    model: ModelType
    temperature?: number
    max_thoughts?: number
}

export  interface SkilledWorkerDescriptor extends AutonomousWorkerDescriptor {
    deployment_type: "SkilledWorker"
    manager: string
    qaManager: string
}

export  interface ManagerDescriptor extends AutonomousWorkerDescriptor {
    deployment_type: "Manager"
    manager?: string
}

export  interface QAManagerDescriptor extends AutonomousWorkerDescriptor {
    deployment_type: "QAManager"
    manager: string
}

export type ResourceType = ("MetaConcept" | "Deployment")

export interface Resource {
    kind: ResourceType
    title: string,
}

export type DeploymentType = ("BuiltinFunction" | "SkilledWorker" | "Manager" | "QAManager")

export type DescriptorStatus = ("started" | "stopped")

export interface BaseWorkerDescriptor extends Resource {
    deployment_type: DeploymentType
    status?: DescriptorStatus,
    identifier: string,
    job_description: string,
    input_schema: Record<string, any>
    output_schema: Record<string, any>
    num_to_start: number
    available_tools: string[]
}
