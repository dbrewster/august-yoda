import {RunManger} from "@/util/llm/BaseItem";
import {EventHandler, YodaEvent} from "@/util/llm/EventHandler";
import {executeLLM} from "@/util/llm/Executor";
import {DefineNewConceptAgent} from "@/obiwan/auto-concept/DefineNewConceptAgent";
import dotenv from "dotenv";
import {InputValues} from "langchain/schema";

class CommandLineEventHandler implements EventHandler {
    handleEvent(event: YodaEvent): void {
        if (event.eventName === "onAfterExecAgent") {
            const generationInfo = event.args.generationInfo
            console.log(`\x1b[2mAgent: (${event.id}) -- ${generationInfo.tokenUsage.totalTokens} tokens used\x1b[0m`);
            if (event.args.content?.length) {
                console.log(`Agent thought: \x1b[32m${event.args.content}\x1b[0m`);
            }
            if (event.args.functionName === "thought_or_observation") {
                console.log(`\x1b[38;5;110mAgent observation: ${event.args.parameters.observation}\x1b[0m`);
                console.log(`\x1b[32mAgent thought: ${event.args.parameters.thought}\x1b[0m`);
            } else if (event.args.functionName === "final_answer") {
                console.log(`\x1b[38;5;110mAgent result: ${JSON.stringify(event.args.parameters, null, 2)}\x1b[0m`);
            } else if (event.args.functionName) {
                console.log(`\x1b[2mAgent action: ${event.args.functionName}\x1b[0m`);
            }
        } else if (event.eventName === "onBeforeExecAgent") {
            console.log(`\x1b[2mAgent: thinking...\x1b[0m`);
        }
    }
}

const executeAgentLLM = async (...args: string[]) => {
    switch (args[0]) {
        case "create-base-concept":
        case "create-concept":
            const buildFromTables = args[0] === "create-base-concept"
            const conceptName = args[1]
            const runManager = new RunManger()
            runManager.addHandler(new CommandLineEventHandler)
            console.log(`Human: Create a new concept called "${conceptName}"`)
            const input: InputValues = {system: "CRM", process: "revenue operations", concept_name: conceptName};
            if (args.length > 2) {
                input.additional_instructions = args[2]
            }
            const ret = await executeLLM(new DefineNewConceptAgent(buildFromTables), "123", input, "user1", {}, runManager, 0.2)
            const concept = ret.concept as Record<string, any>
            const interfaceDef = `/*
  ${concept.definition}
  
  The friendly name of the concept is ${concept.friendly_name}
*/
interface ${concept.concept_identifier} constrained_by ${concept.base_concept} {
  constraintQuery = ${concept.constraint_query}
  
${(concept.properties as Record<string, any>[]).map(prop => `  //${prop.description}\n  ${prop.property_name}:${prop.type}`).join("\n")}
}
`
            console.log(interfaceDef)
    }
}

dotenv.config()
await executeAgentLLM(...process.argv.slice(2))
