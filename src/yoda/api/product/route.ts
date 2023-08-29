import {mongoCollection} from "@/yoda/api/util.js";
import {Application} from "express";

export async function register(app: Application) {
  app.get("/product", (req, res) => {
    return mongoCollection("system_dps").then(async collection => {
      return res.json(await collection.find({}, {projection: {_id: 0}}).toArray())
    })
  })
}
