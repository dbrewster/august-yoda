import {mongoCollection} from "@/yoda/api/util.js";
import {ObjectId} from "mongodb";
import {Application} from "express";

export async function register(app: Application) {
  app.get("/chat/:id", (req, res) => {
    const userId = req.query.userId;
    if (!userId) {
      return res.status(404).send('Not found')
    }
    const sessionId = new ObjectId(req.params.id)
    return mongoCollection("session").then(async collection => {
      const session = await collection.findOne({userId: userId, _id: sessionId});
      if (!session) {
        return res.status(404).send('Not found')
      }
      return res.json(session)
    })
  })
  app.patch("/chat/:id", (req, res) => {
    const userId = req.query.userId;
    if (!userId) {
      return res.status(404).send('Not found')
    }
  const sessionId = new ObjectId(req.params.id)
  const data = req.body
  delete data._id

  return mongoCollection("session").then(collection => {
    collection.updateOne({'_id': sessionId, 'userId': userId}, {"$set": data})
  }).then(() => {
    return res.json(data)
  })
  })

  app.delete("/chat/:id", async (req, res) => {
    const userId = req.query.userId;
    if (!userId) {
      return res.status(404).send('Not found')
    }
    const sessionId = new ObjectId(req.params.id)
    mongoCollection('chat_history').then(collection => {
      return collection.deleteMany({'chatId': sessionId, 'userId': userId})
    })
    const count = mongoCollection('session').then(collection => {
      return collection.deleteMany({"_id": sessionId, 'userId': userId}).then(x => x.deletedCount)
    })
    return res.json(await count)
  })
}
