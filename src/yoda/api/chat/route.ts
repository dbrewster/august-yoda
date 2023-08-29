import {ObjectId} from "mongodb";
import {DateTime} from "luxon";
import {mongoCollection} from "@/yoda/api/util.js";
import {Application} from "express"

export async function register(app: Application) {
  app.get("/chat", (req, res) => {
    const userId = req.query.userId;
    if (!userId) {
      return res.status(404).send('Not found')
    }
    return mongoCollection("session").then(async collection => {
      return res.json(await collection.find({userId: userId}).toArray())
    })
  })

  app.post("/chat", async (req, res) => {
    const userId = req.query.userId;
    if (!userId) {
      return res.status(404).send('Not found')
    }
    const data = req.body
    data._id = data._id ? ObjectId.createFromHexString(data._id) : new ObjectId()
    data['userId'] = userId
    data['creationDate'] = DateTime.now().toISODate()
    return mongoCollection("session").then(collection => {
      collection.insertOne(data)
    }).then(() => {
      return res.json(data)
    })
  })
  app.delete("/chat", async (req, res) => {
    const userId = req.query.userId;
    if (!userId) {
      return res.status(404).send('Not found')
    }
    mongoCollection('chat_history').then(collection => {
      return collection.deleteMany({'userId': userId})
    })
    const count = mongoCollection('session').then(collection => {
      return collection.deleteMany({'userId': userId}).then(x => x.deletedCount)
    })
    return res.json(await count)
  })
}
