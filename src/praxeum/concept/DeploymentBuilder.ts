import {DefineNewConceptAgent} from "@/obiwan/auto-concept/DefineNewConceptAgent";
import process from "process";
import {zodToJsonSchema} from "zod-to-json-schema";
import {Agent, ToolItem} from "@/util/llm/Agent";
import {FindBaseConceptAgent, GetAllConcepts, GetConceptDetails} from "@/obiwan/auto-concept/FindBaseConceptAgent";
import {
    FindPropertiesAndConstraintAgent,
    GetConceptDetailsWithSampleRows,
    GetQueryInterface
} from "@/obiwan/auto-concept/FindPropertiesAndConstraintAgent";
import {z, ZodType} from "zod";
import {
    BuiltinWorkerDescriptor,
    Deployment,
    ManagerDescriptor,
    SkilledWorkerDescriptor
} from "@/praxeum/DeploymentDescriptor";
import YAML from "yaml";
import fs from "fs";

function getBuiltIn(base: ToolItem, functionName: string, outputSchema: ZodType): BuiltinWorkerDescriptor {
    return {
        title: base.name,
        identifier: base.name + '_alpha',
        function_name: functionName,
        job_description: base.description,
        input_schema: zodToJsonSchema(base.inputSchema),
        output_schema: zodToJsonSchema(outputSchema),
        num_to_start: 1,
        available_tools: []
    }
}

function getAgentObject(agent: Agent, input_schema: ZodType, tools: string[] | undefined = undefined): SkilledWorkerDescriptor {
    return {
        title: agent.name,
        identifier: agent.name + '_alpha',
        available_tools: tools || [],
        job_description: agent.props.description,
        initial_plan: agent.props.agentMessage!,
        initial_instructions: agent.props.humanMessage,  // defines input schema
        input_schema: zodToJsonSchema(input_schema),
        output_schema: zodToJsonSchema(agent.outputSchema),
        model: "gpt-3.5-turbo-16k",
        temperature: 0.2,
        num_to_start: 1,
        manager: "concept_manager",
        qaManager: "concept_qa",
    }
}


let dnc = new DefineNewConceptAgent();
const dncSchema = z.object({
    system: z.string().describe("The type of system the concept exists in. Eg, CRM"),
    process: z.string().describe("The system the concept exists in. Eg, revenue operations"),
    concept_name: z.string().describe("The name of the concept to define. Eg, Opportunity"),
    additional_instructions: z.string().optional()
})

function getManager(title: string, manager: string | undefined = "upper_management"): ManagerDescriptor {
    return {
        title: title,
        identifier: title + '_alpha',
        job_description: "job description",
        initial_plan: "plan",
        initial_instructions: "inst",
        input_schema: {},
        output_schema: {},
        available_tools: [],
        num_to_start: 1,
        manager: manager,
        model: "gpt-3.5-turbo-16k"
    }
}

let fc = new FindBaseConceptAgent();
let fpc = new FindPropertiesAndConstraintAgent();
const deployment: Deployment = {
    name: "define_new_concept",
    builtin_workers: [
        getBuiltIn(new GetAllConcepts(false), "ConceptFunctions.list", z.object({
            concepts: z.string().describe("A comma separated list of concept names")
        })),
        getBuiltIn(new GetConceptDetails(false), "ConceptFunctions.getDetails", z.object({
            concept: z.string().describe("A string describing details for requested concepts")
        })),
        getBuiltIn(new GetConceptDetailsWithSampleRows(false), "ConceptFunctions.getDetailsWithSample", z.object({
            concept: z.string().describe("A string describing details for the requested concept with sample rows")
        })),
        getBuiltIn(new GetQueryInterface(false), "ConceptFunctions.getInterfaces", z.object({
            query_language: z.string().describe("The concept query language rules"),
            examples: z.string().describe("Examples of how to use concept the query language"),
        })),
    ],
    skilled_workers: [
        getAgentObject(dnc, dncSchema, [fc.name, fpc.name]),
        getAgentObject(fc, fc.inputSchema, ["ConceptFunctions.list", "ConceptFunctions.getDetails"]),
        getAgentObject(fpc, fpc.inputSchema, ["ConceptFunctions.getDetailsWithSample", "ConceptFunctions.getInterfaces"])
    ],
    managers: [
        getManager("upper_management", undefined),
        getManager("qa_head_manager"),
        getManager("concept_manager")
    ],
    qa_managers: [{
        title: "concept_qa",
        identifier: "concept_qa_alpha",
        job_description: "You tell workers to write more tests",
        initial_plan: "plan",
        initial_instructions: "inst",
        input_schema: { },
        output_schema: { },
        available_tools: [],
        num_to_start: 1,
        manager: "qa_head_manager",
        model: "gpt-3.5-turbo-16k"
    }],
}

fs.writeFileSync("src/praxeum/concept/basic_deployment.yaml", YAML.stringify(deployment))

process.exit()
