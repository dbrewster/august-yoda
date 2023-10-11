import {Command} from "commander";
import {startServer} from "@/praxeum/SingleNodeDeployment";
import dotenv from "dotenv";

const program = new Command()
program.name("praxeum")
.description("Command line tool to control praxeum server")
.version("0.0.1")

program.command("start")
.description("Starts the server")
.argument("<descriptor file>", "the path to the descriptor file")
.action((path) => {
    startServer(path)
})

dotenv.config()
program.parse()
