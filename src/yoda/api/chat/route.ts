import {ObjectId} from "mongodb";
import {DateTime} from "luxon";
import {mongoCollection} from "@/yoda/api/util.js";
import {Application} from "express"

export async function register(app: Application) {
  app.get("/chat", async (req, res) => {
    const userId = req.query.userId;
    if (!userId) {
      return res.status(404).send('Not found')
    }
    let collection = await mongoCollection("session");
    return res.promise(collection.find({userId: userId}).toArray())
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
    let collection = await mongoCollection("session");
    return res.promise(collection.insertOne(data).then(()=> data))
  })
  app.delete("/chat", async (req, res) => {
    const userId = req.query.userId;
    if (!userId) {
      return res.status(404).send('Not found')
    }
    let chat_debug = await mongoCollection("chat_debug");
    await chat_debug.deleteMany({'userId': userId})
    let session = await mongoCollection("session");
    await session.deleteMany({'userId': userId})
    let chat_history = await mongoCollection("chat_history");
    return res.promise(chat_history.deleteMany({'userId': userId}).then(x => x.deletedCount))
  })
}
