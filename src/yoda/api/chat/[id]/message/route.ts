import {mongoCollection} from "@/yoda/api/util.js";
import {executeQuery} from "@/yoda/new-query/QE2.js";
import {Application} from "express";

export default async function register(app: Application) {
  app.get("/chat/:id/message", (req, res) => {
    const userId = req.query.userId;
    if (!userId) {
      return res.status(404).send('Not found')
    }
    const sessionId = req.params.id
    return mongoCollection("chat_history").then(async collection => {
      const sessions = await collection.find({'userId': userId, 'chatId': sessionId}, ).toArray();
/*
      const ret = sessions.map((obj: Document) => {
        const history = obj.message
        delete obj.message
        for (let objKey in history) {
          obj[objKey] = history[objKey]
        }
        return obj
      })
*/
      return res.json(sessions);
    })
  })
  app.post("/chat/:id/message", async (req, res) => {
    const userId = req.query.userId;
    if (!userId) {
      return res.status(404).send('Not found')
    }
    const sessionId = req.params.id
    const input = req.body
    const verbose = req.body.verbose
    let result = await executeQuery(userId as string, sessionId, input.query, verbose);
    return res.json(result)
  })
}
