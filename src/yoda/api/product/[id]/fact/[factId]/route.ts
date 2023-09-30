import {mongoCollection} from "@/util/util";
import {ObjectId} from "mongodb";
import {Application} from "express";

export async function register(app: Application) {
  app.get("/product/:id/fact/:factId", async (req, res) => {
    const tableName = req.params.id === "System" ? "system_facts" : `dp_${req.params.id}_facts`
    const factId = ObjectId.createFromHexString(req.params.factId)
    console.log(req.params.factId, factId)
    const collection = await mongoCollection(tableName);
    const obj = await collection.findOne({_id: factId});
    console.log(obj)
    if (!obj) {
      return res.status(404).send('Not found')
    }
    return res.promise(obj)
  })
  app.get("/product/:id/fact/:factId", async (req, res) => {
    const tableName = req.params.id === "System" ? "system_facts" : `dp_${req.params.id}_facts`
    const factId = ObjectId.createFromHexString(req.params.factId)
    const collection = await mongoCollection(tableName);
    const count = await collection.deleteOne({"_id": factId}).then(x => x.deletedCount)
    return res.promise(count)
  })
}
