import {Application} from "express"
import {AgentRegistry} from "@/kamparas/AgentRegistry"
import {getDeferred, mongoCollection} from "@/util/util"
import {EpisodicEvent} from "@/kamparas/Memory"
import {NewTaskInstruction} from "@/kamparas/Environment"

interface ConversationChainItem {
  conversation_id: string,
  agent_title: string,
  agent_id: string
}

export async function register(app: Application) {
  app.get("/agent/:id/conversation/:conversationId/chain", async (req, res) => {
    const agentTitle = req.params.id
    const conversationId = req.params.conversationId
    let identifier = AgentRegistry.getIdentifier(agentTitle)
    const collection = await mongoCollection("episodic")
    // get the header event for this conversation
    let agentId = identifier.identifier
    let currentChain: ConversationChainItem | undefined = {
      conversation_id: conversationId,
      agent_title: identifier.title,
      agent_id: identifier.identifier
    }
    const deferred = getDeferred<ConversationChainItem[]>()
    try {
      const retChains = [currentChain]
      while (currentChain) {
        const taskStart = await collection.findOne<EpisodicEvent>({
          conversation_id: currentChain.conversation_id,
          agent_title: currentChain.agent_title,
          agent_id: currentChain.agent_id,
          type: 'task_start'
        })
        if (taskStart) {
          const newTask = taskStart.content as NewTaskInstruction
          currentChain = {
            conversation_id: newTask.helpee_conversation_id,
            agent_title: newTask.helpee_title,
            agent_id: newTask.helpee_id
          }
          retChains.push(currentChain)
        } else {
          currentChain = undefined
        }
      }
      deferred.resolve(retChains.reverse())
    } catch (e) {
      deferred.reject(e)
    }

    return res.promise(deferred.promise)
  })
}
