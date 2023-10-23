import {Command, Option} from "commander";
import {setRootLoggerLevel} from "@/util/RootLogger";
import process from "process";
import {PraxeumServer} from "@/praxeum/PraxeumServer"
import {YodaServer} from "@/yoda/YodaServer"
import dotenv from "dotenv"

dotenv.config()


const praxeumServer = new PraxeumServer()
const yodaServer = new YodaServer()

const program = new Command()
program.name("praxeum_server")
    .description("Command line tool for praxeum server")
    .addOption(new Option('--loglevel <level>', 'log level').choices(["error", "warning", "info", "debug"]).default('info'))
    .version("0.0.1")

program.command("start")
    .action(async (options) => {
        setRootLoggerLevel(program.opts().loglevel)
        await praxeumServer.initialize()
        await yodaServer.initialize()
        praxeumServer.start()
        yodaServer.start()
    })
program.parse(process.argv)
