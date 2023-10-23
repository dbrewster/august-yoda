import express, {Application, Request, Response} from "express"
import process from "process"
import {ErrorRequestHandler} from "express-serve-static-core"
import {rootLogger} from "@/util/RootLogger"
import bodyParser from "body-parser"
import {promiseMiddleware} from "@/util/promise-middleware"
import {getSingleNodeDeployment, startSingleNodeServer} from "@/praxeum/server/SingleNodeDeployment"

export class PraxeumServer {
    app?: Application

    constructor() {
    }

    async initialize() {
        const dataDir = `${process.env.PRAXEUM_DATA_DIR}`

        const handler: ErrorRequestHandler = (err, req, res, next) => {
            rootLogger.error("Error in handling request", err)
            res.status(500)
            res.send(err)
        }

        const logger = rootLogger.child({type: "server"})
        const app: Application = express();
        // @ts-ignore
        app.use(bodyParser.text())
        app.use(promiseMiddleware(logger))

        app.get('/', (req: Request, res: Response) => {
            res.send('Welcome to praxeum');
        });

        app.use(handler)

        const singleNodeServer = startSingleNodeServer(dataDir)
        await singleNodeServer.initialize()

        app.get("/server/status", async (req, res) => {
            if (singleNodeServer.status().length == 0) {
                return res.promise("No workers are running")
            }
            return res.promise(singleNodeServer.status().map(s => {
                return `${s.resource}: ${s.status}`
            }).join("\n") + "\n")
        })

        app.post("/server/start", async (req, res) => {
            const response = await getSingleNodeDeployment().start()
            let retStr = `Started [${response.started.join(", ")}]\nAlready started [${response.alreadyStarted.join(", ")}]`
            return res.promise(retStr)
        })

        app.post("/server/stop", async (req, res) => {
            return res.promise(getSingleNodeDeployment().stop())
        })

        app.post("/server/apply", async (req, res) => {
            return res.promise(getSingleNodeDeployment().apply(req.body))

        })

        this.app = app
    }

    start() {
        const port = process.env.PRAXEUM_PORT || 8001;
        this.app!.listen(port, () => {
            console.log(`Server is listening at http://localhost:${port}`);
        })
    }
}