import {mongoCollection} from "@/util/util";
import {ObjectId} from "mongodb";
import {Application} from "express";

export async function register(app: Application) {
  app.get("/chat/:id/message/:messageId", async (req, res) => {
    const userId = req.query.userId;
    if (!userId) {
      return res.status(404).send('Not found')
    }
    const sessionId = req.params.id
    const messageId = req.params.messageId
    const collection = await mongoCollection("chat_history");
    const message = await collection.findOne({
      'userId': userId,
      'sessionId': sessionId,
      _id: ObjectId.createFromHexString(messageId)
    })
    if (!message) {
      return res.status(404).send('Not found')
    }
    return res.promise(message)
  })

  app.put("/chat/:id/message/:messageId", async (req, res) => {
    const userId = req.query.userId;
    if (!userId) {
      return res.status(404).send('Not found')
    }
    const sessionId = req.params.id
    const messageId = req.params.messageId
    const data = req.body
    delete data._id
    const collection = await mongoCollection("chat_history");
    return res.promise(collection.updateOne(
      {'userId': userId, 'sessionId': sessionId, _id: ObjectId.createFromHexString(messageId)},
      data).then(m => m.modifiedCount))
  })

  app.put("/chat/:id/message/:messageId", async (req, res) => {
    const userId = req.query.userId;
    if (!userId) {
      return res.status(404).send('Not found')
    }
    const sessionId = req.params.id
    const messageId = req.params.messageId
    const collection = await mongoCollection("chat_history");
    return res.promise(collection.deleteOne({
      'userId': userId,
      'sessionId': sessionId,
      _id: ObjectId.createFromHexString(messageId)
    }).then(r => r.deletedCount))
  })
}
