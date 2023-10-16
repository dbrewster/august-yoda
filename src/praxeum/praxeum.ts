import {Command, Option} from "commander";
import dotenv from "dotenv";
import {RootQuestion} from "@/kamparas/RootQuestion";
import {RabbitAgentEnvironment} from "@/kamparas/internal/RabbitAgentEnvironment";
import JSON5 from "json5";
import {shutdownRabbit} from "@/kamparas/internal/RabbitMQ";
import {mongoCollection, shutdownMongo} from "@/util/util";
import {rootLogger, setRootLoggerLevel} from "@/util/RootLogger";
import process from "process";
import fs from "node:fs";
import axios from "axios";
import {EpisodicEvent} from "@/kamparas/Memory";
import clc from "cli-color";
import YAML from "yaml";

dotenv.config()

const praxeumURL = `http://${process.env.PRAXEUM_HOST || "localhost"}:${process.env.PRAXEUM_PORT || "8001"}`
const textOptions = { headers: {'Content-Type': 'text/plain'} };
const jsonOptions = { headers: {'Content-Type': 'application/json'} };

const program = new Command()
program.name("praxeum")
    .description("Command line tool to control praxeum server")
    .addOption(new Option('--loglevel <level>', 'log level').choices(["error", "warning", "info", "debug"]).default('info'))
    .version("0.0.1")

program.command("apply")
    .description("updates yamls for server")
    .argument("<path...>", "the path to the descriptor file(s)")
    .action(async (path) => {
        setRootLoggerLevel("info")
        let data: string = ""
        if (Array.isArray(path)) {
            data = path.map(p => fs.readFileSync(p, "utf-8")).join("\n---\n")
        } else {
            data = fs.readFileSync(path, "utf-8")
        }
        axios.post(`${praxeumURL}/server/apply`, data, textOptions).then(r => {
            rootLogger.info(`Applied with status ${r.status}: ${r.data}`)
        }).catch(e => {
            rootLogger.error(`Error applying:`, e)
        })
    })
program.command("stop")
    .description("Stops all instances running in the server")
    .action(async () => {
        setRootLoggerLevel("info")
        axios.post(`${praxeumURL}/server/stop`, "", textOptions).then(r => {
            rootLogger.info(`Server stopped with status ${r.status}: ${r.data}`)
        }).catch(e => {
            rootLogger.error(`Error stopping server:`, e)
        })
    })
program.command("start")
    .description("Starts all instances running in the server")
    .action(async () => {
        setRootLoggerLevel("info")
        axios.post(`${praxeumURL}/server/start`, "", textOptions).then(r => {
            rootLogger.info(`Server started with status ${r.status}: ${r.data}`)
        }).catch(e => {
            rootLogger.error(`Error starting server:`, e)
        })
    })

program.command("status")
    .description("Gets the status of the server")
    .action(async () => {
        axios.get(`${praxeumURL}/server/status`, textOptions).then(r => {
            rootLogger.info(r.data)
        }).catch(e => {
            rootLogger.error(`Error getting status:`, e)
        })
    })

program.command("command")
    .description("Executes a command against a job title")
    .option('--log-level', 'log level', 'info')
    .argument("<title>", "The job title to execute the command against")
    .argument("<command>", "The command to execute in the form of a json object")
    .action(async (title, command) => {
        setRootLoggerLevel(program.opts().loglevel)
        const q = new RootQuestion(new RabbitAgentEnvironment())
        await q.start()
        const response = await q.askQuestion(title, JSON5.parse(command))
        console.log(JSON.stringify(response, null, 2))
        await q.shutdown()
        await shutdownRabbit()
        await shutdownMongo()
    })

// todo, this needs to follow conversations, but to do so we will need a x-request-id concept
// todo, follow would also be good, but we will need to use replica set for mongo for .watch
program.command("review")
    .description("Reviews a worker's conversation")
    .argument("<conversation_id>", "the id of the conversation to review")
    .option('-p, --projection <projection>')
    .option('-m, --max_size <max_size>', "max event size before trimming", "500")
    .action(async (conversation_id, options) => {
        // console.group();
        // console.log("blah")
        // console.log(clc.red("some text"))
        // console.groupEnd();
        // console.log('Back to non-tabbed');
        options.max_size = options.max_size === "false"? undefined : +options.max_size
        options.projection = options.projection? JSON.parse(options.projection) : {
            agent_title: 1, timestamp: 1, type: 1, content: 1
        }

        let collection = await mongoCollection("episodic");
        const found = await collection.find<EpisodicEvent>({
            conversation_id: conversation_id
        }).sort({timestamp: 1}).project(options.projection).toArray()

        // todo, field ordering would be nice
        for (var event of found.map(doc => {
            if (options.projection._id != 1) {
                delete doc._id
            }
            return doc
        })) {
            let eventStr = YAML.stringify(event);
            if (options.max_size && eventStr.length > options.max_size) {
                const lines = eventStr.split("\n")
                eventStr = lines.shift()!
                for (let i = eventStr.length + lines[0].length; i < options.max_size; i+= lines[0].length) {
                    eventStr += "\n" + lines.shift()
                }
                eventStr += "\n...\n"
            }
            console.log("---\n" + eventStr)
        }

        const colorWheel = [ clc.blue, clc.green, clc.black, clc.red, clc.yellow, clc.magenta, clc.cyan ]
        await shutdownMongo()
    })

program.parse(process.argv)
