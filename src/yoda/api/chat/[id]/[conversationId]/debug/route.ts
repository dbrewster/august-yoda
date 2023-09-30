import {Application} from "express";
import {mongoCollection} from "@/util/util";
// @ts-ignore
import wcmatch2 from 'wildcard-match'

export async function register(app: Application) {
  app.get("/chat/:id/:conversationId/debug", async (req, res) => {
    const userId = req.query.userId;
    if (!userId) {
      return res.status(404).send('Not found')
    }
    const sessionId = req.params.id
    const conversationId = req.params.conversationId
    const filter = req.query.filter

    let filters: string[]
    if (typeof (filter) === "string") {
      filters = [filter]
    } else {
      filters = filter as string[]
    }

    const idExp = wcmatch2(filters, {separator:':'}).regexp
    const regExpStr = idExp.toString().slice(5, idExp.toString().length-3)
    const matches = mongoCollection("chat_debug").then(collection => {
      return collection.find({userId: userId, chatId: sessionId, conversationId: conversationId, id: {$regex: `${regExpStr}`}}).toArray()
    })
    return res.promise(matches)
  })
}
