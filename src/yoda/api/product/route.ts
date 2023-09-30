import {mongoCollection} from "@/util/util";
import {Application} from "express";

export async function register(app: Application) {
  app.get("/product", async (req, res) => {
    const collection = await mongoCollection("system_dps");
    return res.promise(await collection.find({}, {projection: {_id: 0}}).toArray())
  })
}
