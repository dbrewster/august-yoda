import {Agent, AskCommand, TaskContext, TaskResponse} from "alphawave-agents";
import {OpenAIModel} from "alphawave";
import {config} from "dotenv";
import * as readline from "readline";
import {ToolItem} from "@/util/llm/Agent";
import {SchemaBasedCommand} from "alphawave-agents/src/SchemaBasedCommand";
import {zodToJsonSchema} from "zod-to-json-schema";
import {z} from "zod";
import {executeLLM} from "@/util/llm/Executor";
import {BaseItem} from "@/util/llm/BaseItem";
import {InputValues} from "langchain/schema";
import {FindConceptDetails, GetRootConcept} from "@/obiwan/auto-concept/AutoConcept";

// Read in .env file.
config();

class ToolCommand extends SchemaBasedCommand<InputValues> {
  private tool: BaseItem & ToolItem;

  constructor(tool: BaseItem & ToolItem) {
    super({
      title: tool.name,
      description: tool.description,
      ...zodToJsonSchema(tool.inputSchema)
    } as any, tool.name, tool.description);
    this.tool = tool
  }

  execute(context: TaskContext, input: InputValues): Promise<any> {
    return executeLLM(this.tool, "runId", input, "user")
  }
}

// Create an OpenAI or AzureOpenAI client
const model = new OpenAIModel({
  apiKey: process.env.OpenAIKey!,
  completion_type: 'chat',
  model: 'gpt-3.5-turbo-16k',
  temperature: 0.2,
  max_input_tokens: 6000,
});

const outputSchema = zodToJsonSchema(z.object({
  conceptIdentifier: z.string().describe("A legal javascript identifier for the new concept. Should start with a capital letter"),
  conceptName: z.string().describe("The human readable name of the concept. Usually the name of the concept the user provided"),
  conceptDescription: z.string().describe("The detailed description for the new concept. Fetched from a tool and can be corrected by the end user."),
  rootConcept: z.string().describe("The concept that best describes the root level. Fetched from the tool get_root_concept.")
}))

interface FinalAnswerCommandInput {
  conceptIdentifier: string
  conceptName: string
  baseObjectType: string
}

export class FinalNewConceptAnswerCommand extends SchemaBasedCommand<FinalAnswerCommandInput> {
  public constructor(title?: string, description?: string) {
    super({title: "finalNewConceptAnswer", ...outputSchema} as any, "finalNewConceptAnswer", "Returns the final answer to the user");
  }

  public execute(context: TaskContext, input: FinalAnswerCommandInput): Promise<TaskResponse> {
    return Promise.resolve({
      type: "TaskResponse",
      status: "success",
      message: JSON.stringify(input, null, 2)
    });
  }
}

// Create an agent
const agent = new Agent({
  model,
  prompt: `You are an expert in customer relationship management (CRM) systems, specifically the function of revenue operations function. Your primary function is to create new concepts. 
You are given a set of tools that will aid you in creating the new concept.`,
  initial_thought: {
    "thoughts": {
      "thought": "I need to ask the user for the concept they would like to edit or create",
      "reasoning": "This is the first step of the task and it will allow me to get the input for the commands. I eventually must show the user the completed concept.",
      "plan":
        `- ask the user for the concept to edit or create
 - use the provided tools to fill in the parts of the new concept
 - ask the user for input if any part of the answer is ambiguous
 - the final answer should be of the form:
 ${outputSchema}
 - continue to process using the builtin tools or by asking the user the answer until every part of the output can be filled in.
 - use the finalAnswer command to present the answer
 `
    },
    "command": {
      "name": "ask",
      "input": {"question": "Hi! I'm an expert in creating new concepts. What problem would you like me to solve?"}
    }
  },
  max_time: 600000,
  logRepairs: true,
});

// Add commands to the agent
agent.addCommand(new AskCommand());
agent.addCommand(new FinalNewConceptAnswerCommand());
agent.addCommand(new ToolCommand(new FindConceptDetails()));
agent.addCommand(new ToolCommand(new GetRootConcept()));

// Listen for new thoughts
agent.events.on('newThought', (thought) => {
  console.log(`\x1b[2m[${thought.thoughts.thought}]\x1b[0m`);
});

// Create a readline interface object with the standard input and output streams
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Define main chat loop
async function chat(botMessage: string | undefined) {
  // Show the bots message
  if (botMessage) {
    console.log(`\x1b[32m${botMessage}\x1b[0m`);
  }

  // Prompt the user for input
  rl.question('User: ', async (input: string) => {
    // Check if the user wants to exit the chat
    if (input.toLowerCase() === 'exit') {
      // Close the readline interface and exit the process
      rl.close();
      process.exit();
    } else {
      // Route users message to the agent
      const result = await agent.completeTask(input);
      switch (result.status) {
        case 'success':
        case 'input_needed':
          await chat(result.message);
          break;
        default:
          if (result.message) {
            console.log(`${result.status}: ${result.message}`);
          } else {
            console.log(`A result status of '${result.status}' was returned.`);
          }

          // Close the readline interface and exit the process
          rl.close();
          process.exit();
          break;
      }
    }
  });
}

// Start chat session
chat(`Hi! I'm an expert in creating new concepts. What problem would you like me to solve?`);