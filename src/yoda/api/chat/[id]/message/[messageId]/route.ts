import {mongoCollection} from "@/yoda/api/util.js";
import {ObjectId} from "mongodb";
import {Application} from "express";

export async function register(app: Application) {
  app.get("/chat/:id/message/:messageId", (req, res) => {
    const userId = req.query.userId;
    if (!userId) {
      return res.status(404).send('Not found')
    }
    const sessionId = req.params.id
    const messageId = req.params.messageId
    return mongoCollection("chat_history").then(async collection => {
      const message = await collection.findOne({
        'userId': userId,
        'sessionId': sessionId,
        _id: ObjectId.createFromHexString(messageId)
      })
      if (!message) {
        return res.status(404).send('Not found')
      }
      return res.json(message)
    })
  })

  app.put("/chat/:id/message/:messageId", (req, res) => {
    const userId = req.query.userId;
    if (!userId) {
      return res.status(404).send('Not found')
    }
    const sessionId = req.params.id
    const messageId = req.params.messageId
    const data = req.body
    delete data._id
    return mongoCollection("chat_history").then(async collection => {
      const message = await collection.updateOne(
        {'userId': userId, 'sessionId': sessionId, _id: ObjectId.createFromHexString(messageId)},
        data)
      return message.modifiedCount
    })
  })

  app.put("/chat/:id/message/:messageId", (req, res) => {
    const userId = req.query.userId;
    if (!userId) {
      return res.status(404).send('Not found')
    }
    const sessionId = req.params.id
    const messageId = req.params.messageId
    return mongoCollection("chat_history").then(async collection => {
      return collection.deleteOne({
        'userId': userId,
        'sessionId': sessionId,
        _id: ObjectId.createFromHexString(messageId)
      }).then(r => r.deletedCount)
    })
  })
}
