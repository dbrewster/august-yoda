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
import {EpisodicEvent, StructuredEpisodicEvent} from "@/kamparas/Memory";
import clc from "cli-color";
import YAML from "yaml";
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
    .action(async (path: string[]) => {
        setRootLoggerLevel("info")
        const data = path.flatMap(p => {
            if (fs.lstatSync(p).isDirectory()) {
                return fs.readdirSync(p).filter(f => f.endsWith(".yaml"))
                    .map(f => `${path}/${f}`)
                    .map(_p => fs.readFileSync(_p, "utf-8"))
            } else {
                return [fs.readFileSync(p, "utf-8")]
            }
        }).join("\n---\n")
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

program.command("command")
    .description("Executes a command against a job title")
    .option('--log-level', 'log level', 'info')
    .argument("<title>", "The job title to execute the command against")
    .argument("<command>", "The command to execute in the form of a json object")
    .action(async (title, command) => {
        setRootLoggerLevel(program.opts().loglevel)
        await executeStandaloneRequest(title, JSON5.parse(command))
    })

program.command("replay")
    .description("Re executes a request")
    .argument("<request_id>", "The request to replay")
    .action(async (request_id) => {
        let collection = await mongoCollection<EpisodicEvent>("episodic");
        let taskStart = await collection.findOne<EpisodicEvent>({
            type: "task_start", "content.request_id": request_id
        })
        if (!taskStart) {
            console.log(`Unable to find task_start event for request_id ${request_id}`)
            return
        }
        await executeStandaloneRequest(
            taskStart.agent_title,
            (taskStart.content as StructuredEpisodicEvent).input,
            (taskStart.content as StructuredEpisodicEvent).context,
        )
    })


program.command("eavesdrop")
    .description("Follow the event stream")
    .option('-p, --properties <properties>', "json list of properties to return", '["timestamp", "agent_title", "type", "content"]')
    .option('-m, --max_size <max_size>', "max event size before trimming", "500")
    .action(async (options) => {
        options.max_size = options.max_size === "false"? undefined : +options.max_size
        options.properties = JSON.parse(options.properties)

        let colorPicker = new ColorPicker()
        let collection = await mongoCollection<EpisodicEvent>("episodic");
        let changeStream = collection.watch()
        try {
            while (true) {
                const found = await changeStream.next()
                if (found.operationType === "insert") {
                    logEvent(options, found.fullDocument, colorPicker)
                }
            }
        } finally {
            await shutdownMongo()
        }
    })

program.command("review")
    .description("Log events from a single request")
    .argument("<request_id>", "the id of the request to review")
    .option('-p, --properties <properties>', "json list of properties to return", '["agent_title", "type", "content"]')
    .option('-m, --max_size <max_size>', "max event size before trimming", "500")
    .action(async (request_id, options) => {
        options.max_size = options.max_size === "false"? undefined : +options.max_size
        options.properties = JSON.parse(options.properties)

        let collection = await mongoCollection<EpisodicEvent>("episodic");
        await logRequest(request_id, new ColorPicker(), options, collection)
        await shutdownMongo()
    })

async function logRequest(rid: string, colorPicker: ColorPicker, options: any, collection: Collection<EpisodicEvent>) {
    let taskStart = await collection.findOne<EpisodicEvent>({
        type: "task_start", "content.request_id": rid
    })
    if (!taskStart) {
        console.log(`Unable to find task_start event for request_id ${rid}`)
        return
    }
    const cid = taskStart?.conversation_id!
    const found = await collection.find<EpisodicEvent>({conversation_id: cid}).sort({timestamp: 1}).toArray()

    for (var event of found) {
        logEvent(options, event, colorPicker)

        if (event.type === "help") {
            console.group();
            await logRequest(event.callData.requestId, colorPicker, options, collection)
            console.groupEnd()
        }
    }
}

function logEvent(options: any, event: EpisodicEvent, colorPicker: ColorPicker): void {
    const userFacingEvent: any = {}
    let properties: string[] = options.properties
    properties.forEach(prop => {
        userFacingEvent[prop] = (event as any)[prop]
    })
    let eventStr = YAML.stringify(userFacingEvent);
    if (options.max_size && eventStr.length > options.max_size) {
        const lines = eventStr.split("\n")
        eventStr = ""
        for (let i = lines[0].length; i < options.max_size && lines.length > 0; i += lines[0]?.length || 0) {
            eventStr += (eventStr ? "\n" : "") + lines.shift()
        }
        eventStr += "\n...\n"
    }
    console.log(colorPicker.pick(event.agent_title)("---\n" + eventStr))
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
