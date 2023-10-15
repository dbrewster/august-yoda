import process from "process";
import {zodToJsonSchema} from "zod-to-json-schema";
import {z, ZodSchema, ZodType} from "zod";
import {
    BuiltinWorkerDescriptor,
    ManagerDescriptor,
    QAManagerDescriptor,
    SkilledWorkerDescriptor
} from "@/praxeum/DeploymentDescriptor";
import YAML from "yaml";
import fs from "fs";


function getBuiltIn(title: string, description: string, functionName: string, inputSchema: ZodSchema, outputSchema: ZodType): BuiltinWorkerDescriptor {
    return {
        kind: 'Deployment',
        deployment_type: 'BuiltinFunction',
        title: title,
        identifier: title + '_alpha',
        function_name: functionName,
        job_description: description,
        input_schema: zodToJsonSchema(inputSchema),
        output_schema: zodToJsonSchema(outputSchema),
        num_to_start: 1,
        available_tools: []
    }
}

interface PartialWorkerDescriptor {
    title: string,
    job_description: string
    identifier: string
    input_schema: Record<string, any>
    output_schema: Record<string, any>
    initial_plan: string,
    initial_instructions: string
}

const defineNewConcept = {
    title: "define_new_concept",
    identifier: "alpha",
    job_description: "Defines the necessary components of a new concept.",
    initial_plan: `You are a helpful agent answering questions about the creation of a new concept which is represented by an interface in our system. Use the set of given tools to completely answer the users question in detail.`,
    initial_instructions: `You are an agent finding information about concepts in a {system}, specifically for the {process} process.
  Given the brand new concept {concept_name} and it's definition:
  {concept_definition}

  And the concept type of {concept_type}

You need to find the following to define the new concept:
  1. You need to find the base concept this concept will derive from using the provided description. 
  2. You need to find the constraint clause and the properties on the new concept. Be absolutely certain you use the base concept found from step 1.
  3. You need to create a very detailed definition definition of the concept. The definition should contain the details for a concept, how it is used, and how it relates to the key concepts in a {system} system for the {process} process.

Define the new concept.

Let's think aloud step by step
`,
    input_schema: zodToJsonSchema(z.object({
        system: z.string().describe("The type of system the concept exists in. Eg, CRM"),
        process: z.string().describe("The system the concept exists in. Eg, revenue operations"),
        concept_name: z.string().describe("The name of the concept to define. Eg, Opportunity"),
        concept_definition: z.string().describe("The definition of the concept to define."),
        concept_type: z.string().describe("The type of the new concept")
    })),
    output_schema: zodToJsonSchema(z.object({
        concept: z.object({
            concept_identifier: z.string().describe("A legal javascript identifier for the new concept"),
            concept_definition: z.string().describe("The definition of the concept to use"),
            friendly_name: z.string().describe("A human readable name for the new concept"),
            base_concept: z.string().describe("The base concept identifier"),
            constraint_query: z.string().describe("A query that constrains and maps this concept to the base concept."),
            properties: z.array(z.object({
                property_name: z.string().describe("The name of the property. The name must be a legal javascript identifier starting with a lower case character"),
                friendly_name: z.string().describe("A human readable name of the property"),
                description: z.string().describe("A detailed description of the property"),
                type: z.string().describe("The type of the property."),
            }))
        }).describe("The concept to return. Return as much of the definition as you can based on how much you processed").required()
    }))
} as PartialWorkerDescriptor

const findBaseConcept: PartialWorkerDescriptor = {
    title: "find_base_concept",
    identifier: "alpha",
    job_description: "Finds the base concept for a new concept.",
    initial_plan: "You are a helpful agent answering questions about generating information about creating or modifying interfaces in a concept graph.",
    initial_instructions: `You are an agent finding information about concepts in a {system}, specifically for the {process} process.
Given the brand new concept {concept_name} and it's definition:
{concept_definition}

And the concept type of {concept_type}

You are finding the correct base concept to derive this concept from. You can think of the base concept as a delegate concept for this new type. The base concept must be at the same grain, or level, as the new concept.

Find the list of base concepts that might be a match. Return the concept name, a reason why it was chosen, and a probability, between 0 and 1, that it is a good candidate.

Once you have the list, order the list by best probability (closest to 1), limit the check to 3-5 items, and then check the result by getting the details of the top few candidates. Use the details to make your final decision.

Think about how each interface is used in a {system} process and write your intermediate results

Let's think aloud step by step
`,
    input_schema: zodToJsonSchema(z.object({
            system: z.string().describe("The type system we are defining concepts for"),
            process: z.string().describe("The specific process in the system we are defining for"),
            concept_name: z.string().describe("The name of the concept"),
            concept_type: z.string().describe("The type of the new concept"),
            concept_definition: z.string().describe("A very detailed definition of the concept we are finding the base concept for"),
        })
    ),
    output_schema: zodToJsonSchema(z.object({
            base_concept: z.string().describe("The identifier of the base concept ")
        })
    )
}

const findConceptProperties: PartialWorkerDescriptor = {
    title: "find_concept_properties_and_constraints",
    identifier: "alpha",
    job_description: "Finds the optimal set of properties for the the concept given information about the new concept and a base concept and finds a query that maps the new concept to the base concept",
    initial_plan: "You are a helpful agent answering questions about generating information about creating or modifying interfaces in a concept graph.",
    initial_instructions: `You are an agent finding information about concepts in a {system}, specifically for the {process} process.
Given the brand new concept {concept_name} and it's description:
{concept_description}

And the concept type of {concept_type}

And a base concept of {base_concept}

You are finding the optimal set of properties that should exist on this new concept. You will do this by:
  1. Use the provided tool to load the definition of the query interfaces
  2. Get a detailed description of the base concept, {base_concept}
  3. Analyze the properties to determine which properties you can drop off of the new concept. You can drop properties that will only appear in a where clause to create this concept, or properties that are no longer relevant to the new concept. You can also combine properties into higher order properties, if that is necessary.
  4. Generate a Query that maps the base object to this object. You will be filling in the the "where" and "return" parts of the query. The query will start with "Query({base_concept}).
  5. Filter the properties to the necessary list. Explain why you filtered a property
  6. Finally return the new properties and the mapping query
  
Define the properties and constraint query for the new concept

Think about how each interface is used in a {system} process and write your intermediate results

Let's think aloud step by step
`,
    input_schema: zodToJsonSchema(z.object({
            system: z.string().describe("The type system we are defining concepts for"),
            process: z.string().describe("The specific process in the system we are defining for"),
            concept_name: z.string().describe("The name of the concept"),
            concept_type: z.string().describe("The type of the new concept"),
            concept_description: z.string().describe("A detailed description of the concept we are finding the base concept for"),
            base_concept: z.string().describe("The identifier of the base concept to derive the properties from")
        })
    ),
    output_schema: zodToJsonSchema(z.object({
            constraint_query: z.string().describe("The constraint query that maps this concept to the base concept"),
            properties: z.array(z.object({
                property_name: z.string().describe("The name of the property. The name must be a legal javascript identifier starting with a lower case character"),
                friendly_name: z.string().describe("A human readable name of the property"),
                description: z.string().describe("A detailed description of the property"),
                type: z.string().describe("The type of the property."),
                reason: z.string().describe("The reason why this property is on the property and why it should be kept"),
                should_drop: z.boolean().describe("Should this property be dropped or kept on the concept"),
            }))
        })
    )
}

function getAgentObject(partialDescriptor: PartialWorkerDescriptor, tools: string[]): SkilledWorkerDescriptor {
    return {
        kind: 'Deployment',
        deployment_type: "SkilledWorker",
        ...partialDescriptor,
        available_tools: tools,
        temperature: 0.2,
        num_to_start: 1,
        manager: "basic_manager",
        qaManager: "concept_qa",
        model: "gpt-3.5-turbo-16k",
        llm: "openai.function"
    }
}

function getManager(title: string): ManagerDescriptor {
    return {
        kind: 'Deployment',
        deployment_type: "Manager",
        title: title,
        identifier: title + '_alpha',
        job_description: "Provides help to blocked workers",
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
            available_tools: z.string().describe("A list of external resources I have available and short a short description of each."),
            context: z.string().describe("information relevant to the question"),
        })),
        output_schema: zodToJsonSchema(z.object({response: z.string()})),
        available_tools: [],
        num_to_start: 1,
        model: "gpt-4",
        llm: "openai.function"
    }
}

let qaManager: QAManagerDescriptor = {
    kind: 'Deployment',
    deployment_type: "QAManager",
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
        rational: z.string().describe("A description of why the solution was correct or incorrect."),
        correctness: z.number().describe("The probability the provided solution correctly answers the provided question")
    })),
    available_tools: ["basic_manager"],
    num_to_start: 1,
    manager: "basic_manager",
    model: "gpt-4",
    llm: "openai.function"
};
const deployments = [
    getBuiltIn("list_concepts", "Returns all concepts used in the system. This returns the interface and a description of the interface.",
        "ConceptFunctions.list", z.object({
            concept_type: z.string().describe("The type of the new concept we are building.  Must be one of RootConcept or DerivedConcept based on the concept type that is being created or edited")
        }), z.object({
        concepts: z.string().describe("A comma separated list of concept names"),
    })),
    getBuiltIn("concept_details", "Returns the description and properties of one or more concepts.", "ConceptFunctions.getDetails",
        z.object({
            concept_type: z.string().describe("The type of the new concept we are building.  Must be one of RootConcept or DerivedConcept based on the concept type that is being created or edited"),
            concept_identifiers: z.array(z.string().describe("The instance name of the base concept to get the detail of. Must be a valid javascript identifier"))
        }),
        z.object({
        concept: z.string().describe("A string describing details for requested concepts")
    })),
    getBuiltIn("concept_details_and_sample", "Returns the description and properties of an object. It also returns 5 sample rows of data.",
        "ConceptFunctions.getDetailsWithSample", z.object({
            concept_identifier: z.string().describe("The instance name of the concept to get the detail of. Must be a valid javascript identifier"),
            concept_type: z.string().describe("The type of the new concept we are building.  Must be one of RootConcept or DerivedConcept based on the concept type that is being created or edited")
            }) ,
        z.object({
        concept: z.string().describe("A string describing details for the requested concept with sample rows")
    })),
    getBuiltIn("concept_query_interfaces", "Returns the query interfaces needed to define a new query",
        "ConceptFunctions.getInterfaces", z.object({}),
        z.object({
        query_language: z.string().describe("The concept query language rules"),
        examples: z.string().describe("Examples of how to use concept the query language"),
    })),
    getAgentObject(defineNewConcept, [findBaseConcept.title, findConceptProperties.title, "basic_manager", qaManager.title]),
    getAgentObject(findBaseConcept, ["list_concepts", "concept_details", "basic_manager", qaManager.title]),
    getAgentObject(findConceptProperties, ["concept_details_and_sample", "concept_query_interfaces", "basic_manager", qaManager.title]),
    getManager("basic_manager"),
    qaManager,
]

deployments.forEach(d => {
    let output = YAML.stringify(d);

    output = "apiVersion: ad/v1\n" + output
    fs.writeFileSync(`src/praxeum/concept/basic_deployment/${d.title}.yaml`, output)
})

process.exit()
