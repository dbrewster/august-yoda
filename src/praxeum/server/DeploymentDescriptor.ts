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

export type ResourceStatus = ("started" | "stopped")

export type ResourceType = ("MetaConcept" | "AutonomousWorker" | "CodeAgent" | "AgentTemplate")

export interface Resource {
    kind: ResourceType
    title: string,
    status?: ResourceStatus,
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

export type DeploymentType = ("BuiltinFunction" | "SkilledWorker" | "Manager" | "QAManager")

export interface AutonomousAgentDescriptor extends Resource {
    deployment_type: DeploymentType
    identifier: string,
    job_description: string,
    input_schema: Record<string, any>
    output_schema: Record<string, any>
}

export interface CodeAgentDescriptor extends Resource {
    module: string,
    class: string
}

export interface BaseWorkerDescriptor extends AutonomousAgentDescriptor {
    num_to_start: number
    available_tools: string[]
}
