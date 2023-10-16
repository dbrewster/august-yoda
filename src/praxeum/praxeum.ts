import {Command, Option} from "commander";
import dotenv from "dotenv";
import {RootQuestion} from "@/kamparas/RootQuestion";
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
import {MongoMemory} from "@/kamparas/internal/MongoMemory"
import {nanoid} from "nanoid"
import {Collection} from "mongodb"
import bare from "cli-color/bare"
import {MongoRabbitPlatform} from "@/kamparas/internal/MongoRabbitPlatform"

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
        const envBuilder = new MongoRabbitPlatform()
        const q = new RootQuestion()
        q.initialize({memory: envBuilder.buildMemory(q.agent_identifier), environment: envBuilder.buildEnvironment()})
        await q.start()
        const response = await q.askQuestion(title, JSON5.parse(command))
        console.log(JSON.stringify(response, null, 2))
        await q.shutdown()
        await shutdownRabbit()
        await shutdownMongo()
    })

// todo, follow would also be good, but we will need to use replica set for mongo for .watch
program.command("eavesdrop")
    .description("Print out a worker's conversation and downstream heop requests")
    .argument("<request_id>", "the id of the request to review")
    .option('-p, --projection <projection>', "json projection to return.")
    .option('-m, --max_size <max_size>', "max event size before trimming", "500")
    .action(async (request_id, options) => {
        options.max_size = options.max_size === "false"? undefined : +options.max_size
        options.projection = options.projection? JSON.parse(options.projection) : {
            agent_title: 1, timestamp: 1, type: 1, content: 1
        }

        let collection = await mongoCollection<EpisodicEvent>("episodic");
        await logRequest(request_id, new ColorPicker(), options.projection, options.max_size, collection)
        await shutdownMongo()
    })

async function logRequest(rid: string, colorPicker: ColorPicker, projection: any, max_size: number, collection: Collection<EpisodicEvent>) {
    let taskStart = await collection.findOne<EpisodicEvent>({
        type: "task_start", "content.request_id": rid
    })
    if (!taskStart) {
        console.log(`Unable to find task_start event for request_id ${rid}`)
        return
    }
    const cid = taskStart?.conversation_id!
    const found = await collection.find<EpisodicEvent>({
        conversation_id: cid
    }).sort({timestamp: 1}).project({...projection, type: 1, callData: 1, agent_title: 1}).toArray()

    // todo, field ordering would be nice
    for (var event of found) {
        const eventType = event.type
        const callData = event.callData
        const title = event.agent_title

        const props: string[] = ["_id", "type", "callData", "agent_title"]
        props.filter(prop=> projection[prop] != 1).forEach(prop => {
            delete event[prop]
        })
        let eventStr = YAML.stringify(event);
        if (max_size && eventStr.length > max_size) {
            const lines = eventStr.split("\n")
            eventStr = lines.shift()!
            for (let i = eventStr.length + lines[0].length; i < max_size; i+= lines[0].length) {
                eventStr += "\n" + lines.shift()
            }
            eventStr += "\n...\n"
        }
        console.log(colorPicker.pick(title)("---\n" + eventStr))

        if (eventType === "help") {
            console.group();
            await logRequest(callData.requestId, colorPicker, projection, max_size, collection)
            console.groupEnd()
        }
    }
}

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
