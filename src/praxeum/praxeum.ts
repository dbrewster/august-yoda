import {Command, Option} from "commander";
import {startServer} from "@/praxeum/SingleNodeDeployment";
import dotenv from "dotenv";
import {RootQuestion} from "@/kamparas/RootQuestion";
import {RabbitAgentEnvironment} from "@/kamparas/internal/RabbitAgentEnvironment";
import JSON5 from "json5";
import {shutdownRabbit} from "@/kamparas/internal/RabbitMQ";
import {shutdownMongo} from "@/util/util";
import {rootLogger, setRootLoggerLevel} from "@/util/RootLogger";
import process from "process";

const program = new Command()
program.name("praxeum")
    .description("Command line tool to control praxeum server")
    .addOption(new Option('--loglevel <level>', 'log level').choices(["error", "warning", "info", "debug"]).default('info'))
    .version("0.0.1")

program.command("start")
    .description("Starts the server")
    .argument("<path>", "the path to the descriptor file")
    .action(async (path) => {
        setRootLoggerLevel(program.opts().loglevel)
        await startServer(path)
    })

program.command("command")
    .description("Executes a command against a job title")
    .option('--log-level', 'log level', 'info')
    .argument("<title>", "The job title to execute the command against")
    .argument("<command>", "The command to execute in the form of a json object")
    .action(async (title, command) => {
        setRootLoggerLevel(program.opts().loglevel)
        const q = new RootQuestion(new RabbitAgentEnvironment())
        await q.initialize()
        const response = await q.askQuestion(title, JSON5.parse(command))
        console.log(JSON.stringify(response, null, 2))
        await q.shutdown()
        await shutdownRabbit()
        await shutdownMongo()
    })

dotenv.config()
program.parse(process.argv)
