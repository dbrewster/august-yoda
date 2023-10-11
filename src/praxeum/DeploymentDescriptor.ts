import {ModelType} from "@/kamparas/LLM";

export interface AgentDeploymentDescriptor {
    title: string,
    job_description: string,
    initial_plan: string,
    initial_instructions: string,
    input_schema: Record<string, any>
    output_schema: Record<string, any>
    model: ModelType
    temperature?: number
    num_to_start: number
    manager?: string
    qaManager?: string
}

export interface Deployment {
    name: string,
    builtin_workers: AgentDeploymentDescriptor[]
    skilled_workers: AgentDeploymentDescriptor[]
    managers: AgentDeploymentDescriptor[]
    qa_managers: AgentDeploymentDescriptor[]
}
