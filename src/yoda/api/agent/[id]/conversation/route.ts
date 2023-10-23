import {Application} from "express"
import {AgentRegistry} from "@/kamparas/AgentRegistry"
import {mongoCollection} from "@/util/util"

export async function register(app: Application) {
    app.get("/agent/:id/conversation", async (req, res) => {
        const retPromise = Promise.resolve(req.params.id).then(agentTitle => {
            let identifier = AgentRegistry.getIdentifier(agentTitle)
            return mongoCollection("episodic").then(collection => {
                return collection.aggregate([{$match: {agent_title: identifier.title, agent_id: identifier.identifier}}, {$sort: {timestamp: 1}}, {$group: {_id: "$conversation_id"}}]).project({_id: 1}).map(d => d._id as string)
                    .map(v => ({
                        conversation_id: v,
                        agent_title: identifier.title,
                        job_description: identifier.job_description
                    })).toArray()
            })
        })
        return res.promise(retPromise)
    })
}
