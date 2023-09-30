import {mongoCollection} from "@/util/util";
import {executeQuery} from "@/yoda/new-query/QE2";
import {Application} from "express";
import {Document} from "mongodb"

export default async function register(app: Application) {
  app.get("/chat/:id/message", async (req, res) => {
    const userId = req.query.userId;
    if (!userId) {
      return res.status(404).send('Not found')
    }
    const sessionId = req.params.id
    const collection = await mongoCollection("chat_history");
    const sessions = collection.find({'userId': userId, 'chatId': sessionId, context: "main"},).toArray().then( sess =>
      sess.map((obj: Document) => {
        const history = obj.message
        delete obj.message
        for (let objKey in history) {
          obj[objKey] = history[objKey]
        }
        return obj
      })
    )
    return res.promise(sessions)
  })
  app.post("/chat/:id/message", async (req, res) => {
    const userId = req.query.userId;
    if (!userId) {
      return res.status(404).send('Not found')
    }
    const sessionId = req.params.id
    const input = req.body
    const verbose = req.body.verbose
    let result = executeQuery(userId as string, sessionId, input.query, verbose);
    return res.promise(result)
  })
}
