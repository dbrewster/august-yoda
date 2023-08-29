import {mongoCollection} from "@/yoda/api/util.js";
import {ObjectId} from "mongodb";
import {Application} from "express";

export async function register(app: Application) {
  app.get("/product/:id/fact/:factId", (req, res) => {
    const tableName = req.params.id === "System" ? "system_facts" : `dp_${req.params.id}_facts`
    const factId = ObjectId.createFromHexString(req.params.factId)
    console.log(req.params.factId, factId)
    return mongoCollection(tableName).then(async collection => {
      const obj = await collection.findOne({_id: factId});
      console.log(obj)
      if (!obj) {
        return res.status(404).send('Not found')
      }
      return res.json(obj)
    })
  })
  app.get("/product/:id/fact/:factId", async (req, res) => {
    const tableName = req.params.id === "System" ? "system_facts" : `dp_${req.params.id}_facts`
    const factId = ObjectId.createFromHexString(req.params.factId)
    const count = mongoCollection(tableName).then(collection => {
      return collection.deleteOne({"_id": factId}).then(x => x.deletedCount)
    })
    return res.json(await count)
  })
}
