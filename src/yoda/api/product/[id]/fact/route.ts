import {mongoCollection} from "@/yoda/api/util.js";
import {ObjectId} from "mongodb";
import {Application} from "express";

export async function register(app: Application) {
  app.get("/product/:id/fact", (req, res) => {
    const tableName = req.params.id === "System" ? "system_facts" : `dp_${req.params.id}_facts`
    return mongoCollection(tableName).then(async collection => {
      return res.json(await collection.find({}, {projection: {_id: 0}}).toArray())
    })
  })

  app.post("/product/:id/fact", (req, res) => {
    const tableName = req.params.id === "System" ? "system_facts" : `dp_${req.params.id}_facts`
    const data = req.body
    data._id = data._id ? ObjectId.createFromHexString(data._id) : new ObjectId()
    return mongoCollection(tableName).then(collection => {
      collection.insertOne(data)
    }).then(() => {
      return res.json(data)
    })
  })

  app.put("/product/:id/fact", (req, res) => {
    const tableName = req.params.id === "System" ? "system_facts" : `dp_${req.params.id}_facts`
    const data = req.body
    data._id = ObjectId.createFromHexString(data._id)
    return mongoCollection(tableName).then(collection => {
      collection.updateOne({'_id': data._id}, {"$set": data})
    }).then(() => {
      return res.json(data)
    })
  })
}
