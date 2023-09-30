import {mongoCollection} from "@/util/util";
import {ObjectId} from "mongodb";
import {Application} from "express";

export async function register(app: Application) {
  app.get("/product/:id/fact", async (req, res) => {
    const tableName = req.params.id === "System" ? "system_facts" : `dp_${req.params.id}_facts`
    const collection = await mongoCollection(tableName);
    return res.promise(await collection.find({}, {projection: {_id: 0}}).toArray())
  })

  app.post("/product/:id/fact", async (req, res) => {
    const tableName = req.params.id === "System" ? "system_facts" : `dp_${req.params.id}_facts`
    const data = req.body
    data._id = data._id ? ObjectId.createFromHexString(data._id) : new ObjectId()
    const collection = await mongoCollection(tableName);
    await collection.insertOne(data)
    return res.promise(data)
  })

  app.put("/product/:id/fact", async (req, res) => {
    const tableName = req.params.id === "System" ? "system_facts" : `dp_${req.params.id}_facts`
    const data = req.body
    data._id = ObjectId.createFromHexString(data._id)
    const collection = await mongoCollection(tableName);
    await collection.updateOne({'_id': data._id}, {"$set": data})
    return res.promise(data)
  })
}
