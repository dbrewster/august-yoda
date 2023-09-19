import {mongoCollection} from "@/yoda/api/util.js";
import {ObjectId} from "mongodb";
import {Application} from "express";

export async function register(app: Application) {
  app.get("/chat/:id", async (req, res) => {
    const userId = req.query.userId;
    if (!userId) {
      return res.status(404).send('Not found')
    }
    const sessionId = new ObjectId(req.params.id)
    const collection = await mongoCollection("session");
    const session = collection.findOne({userId: userId, _id: sessionId});
    return res.promise(session)
  })
  app.patch("/chat/:id", async (req, res) => {
    res.promise(Promise.resolve().then(async () => {
      const userId = req.query.userId;
      if (!userId) {
        return res.status(404).send('Not found')
      }
      const sessionId = new ObjectId(req.params.id)
      const data = req.body
      delete data._id

      const collection = await mongoCollection("session");
      return collection.updateOne({'_id': sessionId, 'userId': userId}, {"$set": data})
    }))
  })

  app.delete("/chat/:id", async (req, res) => {
    const userId = req.query.userId;
    if (!userId) {
      return res.status(404).send('Not found')
    }
    const sessionId = new ObjectId(req.params.id)
    const chat_debug = await mongoCollection("chat_debug");
    await chat_debug.deleteMany({'chatId': sessionId, 'userId': userId})
    const chat_history = await mongoCollection("session");
    await chat_history.deleteMany({'chatId': sessionId, 'userId': userId})
    const collection = await mongoCollection("session");
    return res.promise(collection.deleteMany({"_id": sessionId, 'userId': userId}).then(x => x.deletedCount))
  })
}
