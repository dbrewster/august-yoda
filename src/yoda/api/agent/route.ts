import {Application} from "express"
import {AgentRegistry} from "@/kamparas/AgentRegistry"

export async function register(app: Application) {
  app.get("/agent", async (req, res) => {
    let root_only = false
    if (req.query["only_roots"]) {
      root_only = true
    }
    return res.promise(AgentRegistry.getAgents().filter(a => root_only ? a.is_root : true).map(a => a.title))
  })
}
