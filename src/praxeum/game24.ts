import {Command, Option} from "commander";
import dotenv from "dotenv";
import {RootQuestion} from "@/kamparas/RootQuestion";
import JSON5 from "json5";
import {shutdownRabbit} from "@/kamparas/internal/RabbitMQ";
import {shutdownMongo} from "@/util/util";
import {setRootLoggerLevel} from "@/util/RootLogger";
import process from "process";
import clc from "cli-color";
import bare from "cli-color/bare"
import {MongoRabbitPlatform} from "@/kamparas/internal/MongoRabbitPlatform"
import {GetNumbersFor24} from "@/praxeum/learner/GetRandomSample";

dotenv.config()

const praxeumURL = `http://${process.env.PRAXEUM_HOST || "localhost"}:${process.env.PRAXEUM_PORT || "8001"}`
const textOptions = { headers: {'Content-Type': 'text/plain'} };
const jsonOptions = { headers: {'Content-Type': 'application/json'} };

const program = new Command()
program.name("game24")
    .description("Command line tool to control praxeum server")
    .addOption(new Option('--loglevel <level>', 'log level').choices(["error", "warning", "info", "debug"]).default('info'))
    .version("0.0.1")


async function executeStandaloneRequest(title: string, data: any, context: any = {}): Promise<void> {
    const envBuilder = new MongoRabbitPlatform()
    const q = new RootQuestion()
    q.initialize({memory: envBuilder.buildMemory(q.agent_identifier), environment: envBuilder.buildEnvironment()})
    await q.start()
    const response = await q.askQuestion(title, data, context)
    console.log(JSON.stringify(response, null, 2).replaceAll("\\n", "\n:"))
    await q.shutdown()
    await shutdownRabbit()
    await shutdownMongo()
}

program.command("game24")
    .description("Runs a simulation of game of 24")
    .option('--log-level', 'log level', 'info')
    .action(async (command) => {
        const index = Math.floor(Math.random() * GetNumbersFor24.numbers.length)
        const g2 = {
            numbers: GetNumbersFor24.numbers[index]
        }
        setRootLoggerLevel(program.opts().loglevel)
        await executeStandaloneRequest("root_worker", g2)
    })

class ColorPicker {
    wheel = [ clc.white, clc.cyan, clc.magenta, clc.blue, clc.green, clc.red, clc.yellow ]
    assignments = new Map<string, bare.Format>()
    pick(key: string) {
        if (!this.assignments.has(key)) {
            const color = this.wheel.shift()!
            this.wheel.push(color)
            this.assignments.set(key, color)
        }
        return this.assignments.get(key)!
    }
}

program.parse(process.argv)
