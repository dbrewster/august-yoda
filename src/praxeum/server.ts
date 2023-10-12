import express, {Application, Request, Response} from 'express';
import dotenv from 'dotenv';

import bodyParser from "body-parser";
import {createServer} from "http";
import {ErrorRequestHandler} from "express-serve-static-core";
import {promiseMiddleware} from "@/yoda/api/promise-middleware";
import {Command, Option} from "commander";
import {setRootLoggerLevel} from "@/util/RootLogger";
import process from "process";
import fs, {MakeDirectoryOptions} from "fs";
import {getSingleNodeDeployment, startSingleNodeServer} from "@/praxeum/SingleNodeDeployment";

//For env File
dotenv.config();

const dataDir = `${process.env.PRAXEUM_DATA_DIR}`

const handler: ErrorRequestHandler = (err, req, res, next) => {
    console.trace("Error in handling request", err)
    res.status(500)
    res.send(err)
}

const app: Application = express();
app.use(bodyParser.text())
app.use(promiseMiddleware())
const port = process.env.PRAXEUM_PORT || 8001;

app.get('/', (req: Request, res: Response) => {
    res.send('Welcome to praxeum');
});

app.use(handler)

const server = createServer(app)
const singleNodeServer = startSingleNodeServer(dataDir)
await singleNodeServer.initialize()

app.get("/server/status", async (req, res) => {
    if (singleNodeServer.status().length == 0) {
        return res.promise("No workers are running")
    }
    return res.promise(singleNodeServer.status().map(s => {
        return `${s.identifier.title}:${s.identifier.identifier}: ${s.status}`
    }).join("\n") + "\n")
})

app.post("/server/start", async (req, res) => {
    const servicesToStart = req.body && req.body.length ? JSON.parse(req.body) : undefined
    const response = await getSingleNodeDeployment().start(servicesToStart)
    let retStr = `Started [${response.toStart.join(", ")}]\nAlready started [${response.started.join(", ")}]`
    if (response.doesNotExist.length > 0) {
        retStr += `\n!!!${response.doesNotExist.join(", ")} does not exist!!!`
    }
    return res.promise(retStr)
})

app.post("/server/stop", async (req, res) => {
    return res.promise(getSingleNodeDeployment().stop())
})

app.post("/server/apply", async (req, res) => {
    return res.promise(getSingleNodeDeployment().apply(req.body))

})

const program = new Command()
program.name("praxeum_server")
    .description("Command line tool for praxeum server")
    .addOption(new Option('--loglevel <level>', 'log level').choices(["error", "warning", "info", "debug"]).default('info'))
    .version("0.0.1")

program.command("start")
    .action((options) => {
        setRootLoggerLevel(program.opts().loglevel)
        server.listen(port, () => {
            console.log(`Server is listening at http://localhost:${port}`);
        })
    })

program.parse(process.argv)

