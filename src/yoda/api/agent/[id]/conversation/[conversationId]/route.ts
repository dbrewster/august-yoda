import {Application} from "express"
import {AgentRegistry} from "@/kamparas/AgentRegistry"
import {mongoCollection} from "@/util/util"
import {EpisodicEvent, eventToString} from "@/kamparas/Memory"

export async function register(app: Application) {
  app.get("/agent/:id/conversation/:conversationId", async (req, res) => {
    const agentTitle = req.params.id
    const conversationId = req.params.conversationId
    let identifier = AgentRegistry.getIdentifier(agentTitle)
    const collection = await mongoCollection("episodic")
    const retPromise = collection.find<EpisodicEvent>({conversation_id: conversationId, agent_title: identifier.title, agent_id: identifier.identifier}).map(e => ({
        event: e,
        text: eventToString(e)
      })
    ).toArray()
    return res.promise(retPromise)
  })
}
