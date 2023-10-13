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
    ManagerDescriptor,
    QAManagerDescriptor,
    SkilledWorkerDescriptor
} from "@/praxeum/DeploymentDescriptor";
import YAML from "yaml";
import fs from "fs";

function getBuiltIn(title: string, base: ToolItem, functionName: string, outputSchema: ZodType): BuiltinWorkerDescriptor {
    return {
        kind: 'BuiltinFunction',
        title: title,
        identifier: title + '_alpha',
        function_name: functionName,
        job_description: base.description,
        input_schema: zodToJsonSchema(base.inputSchema),
        output_schema: zodToJsonSchema(outputSchema),
        num_to_start: 1,
        available_tools: []
    }
}

function getAgentObject(agent: Agent, input_schema: ZodType, tools: string[]): SkilledWorkerDescriptor {
    return {
        kind: "SkilledWorker",
        title: agent.name,
        identifier: agent.name + '_alpha',
        available_tools: tools,
        job_description: agent.props.description,
        initial_plan: agent.props.agentMessage!,
        initial_instructions: agent.props.humanMessage,  // defines input schema
        input_schema: zodToJsonSchema(input_schema),
        output_schema: zodToJsonSchema(agent.outputSchema),
        temperature: 0.2,
        num_to_start: 1,
        manager: "basic_manager",
        qaManager: "concept_qa",
        model: "gpt-3.5-turbo-16k",
        llm: "openai.function"
    }
}


let dnc = new DefineNewConceptAgent();
const dncSchema = z.object({
    system: z.string().describe("The type of system the concept exists in. Eg, CRM"),
    process: z.string().describe("The system the concept exists in. Eg, revenue operations"),
    concept_name: z.string().describe("The name of the concept to define. Eg, Opportunity"),
})

function getManager(title: string): ManagerDescriptor {
    return {
        kind: "Manager",
        title: title,
        identifier: title + '_alpha',
        job_description: "Creates plans to unblock workers",
        initial_plan: `You are a manager of workers. You are responsible for providing a plan for how they should proceed. Consider the problem the problems the worker is facing and the resources they have to solve the problem.
Create a plan for the worker to solve the problem if it is possible.
Tell the worker "STOP WORKING" if they they cannot progress or are not making progress.`,
        initial_instructions: `I am trying am having a problem with \"{problem}\" and am unsure how to proceed. What should I do?

I have the following tools available:
{available_tools}

Here is some context for the problem:
{context}
`,
        input_schema: zodToJsonSchema(z.object({
            problem: z.string().describe("issue at hand"),
            available_tools: z.array(z.object({tool_name: z.string(), tool_description: z.string()})).describe("A list of external resources I have available"),
            context: z.string().describe("information relevant to the question"),
        })),
        output_schema: zodToJsonSchema(z.object({response: z.string()})),
        available_tools: [],
        num_to_start: 1,
        model: "gpt-4",
        llm: "openai.function"
    }
}

let fc = new FindBaseConceptAgent();
let fpc = new FindPropertiesAndConstraintAgent();
let qaManager: QAManagerDescriptor = {
    kind: "QAManager",
    title: "concept_qa",
    identifier: "concept_qa_alpha",
    job_description: "An agent designed to check correctness",
    initial_plan: "You are a helpful agent designed do qa for other agents. You are responsible for assuring correctness. Come up with a test plan for provided question. Use the test plan to determine the correctness probability (between 0 and 1) of the provided solution. Think step by step.",
    initial_instructions: `Is the following solution correct?
### Question ###
{question}
### Solution ###
{solution}`,
    input_schema: zodToJsonSchema(z.object({
        question: z.string().describe("The question which needs validating"),
        solution: z.string().describe("The proposed solution to that question")
    })),
    output_schema: zodToJsonSchema(z.object({
        rational: z.string().describe("Rational for "),
        correctness: z.number().describe("The probability the provided solution correctly answers the provided question")
    })),
    available_tools: [],
    num_to_start: 1,
    manager: "basic_manager",
    model: "gpt-4",
    llm: "openai.function"
};
const deployments = [
    getBuiltIn("list_concepts", new GetAllConcepts(false), "ConceptFunctions.list", z.object({
        concepts: z.string().describe("A comma separated list of concept names")
    })),
    getBuiltIn("concept_details", new GetConceptDetails(false), "ConceptFunctions.getDetails", z.object({
        concept: z.string().describe("A string describing details for requested concepts")
    })),
    getBuiltIn("concept_details_and_sample", new GetConceptDetailsWithSampleRows(false), "ConceptFunctions.getDetailsWithSample", z.object({
        concept: z.string().describe("A string describing details for the requested concept with sample rows")
    })),
    getBuiltIn("concept_query_interfaces", new GetQueryInterface(false), "ConceptFunctions.getInterfaces", z.object({
        query_language: z.string().describe("The concept query language rules"),
        examples: z.string().describe("Examples of how to use concept the query language"),
    })),
        getAgentObject(dnc, dncSchema, [fc.name, fpc.name]),
        getAgentObject(fc, fc.inputSchema, ["list_concepts", "concept_details"]),
        getAgentObject(fpc, fpc.inputSchema, ["concept_details_and_sample", "concept_query_interfaces"]),
        getManager("basic_manager"),
    qaManager,
]

deployments.forEach(d => {
    fs.writeFileSync(`src/praxeum/concept/basic_deployment/${d.title}.yaml`, YAML.stringify(d))
})

process.exit()
