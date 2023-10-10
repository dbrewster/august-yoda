import {ModelType} from "@/kamparas/LLM";

export interface AgentDeploymentDescriptor {
    title: string,
    job_description: string,
    initial_plan: string,
    initial_instructions: string,
    input_schema: string
    output_schema: string
    model: ModelType
    temperature?: number
    num_to_start: number
    manager?: string
    qaManager?: string
}

export interface Deployment {
    exe_name: string,
    builtin_workers: AgentDeploymentDescriptor[]
    skilled_workers: AgentDeploymentDescriptor[]
    managers: AgentDeploymentDescriptor[]
    qa_managers: AgentDeploymentDescriptor[]
}
