import {Application} from "express"
import {AgentRegistry} from "@/kamparas/AgentRegistry"
import {string} from "zod"

export async function register(app: Application) {
    app.get("/agent/:id", async (req, res) => {
        const agentTitle = req.params.id
        let identifier = AgentRegistry.getIdentifier(agentTitle)
        return res.promise(Promise.resolve({
                title: identifier.title,
                job_description: identifier.job_description
            })
        )
    })
}
