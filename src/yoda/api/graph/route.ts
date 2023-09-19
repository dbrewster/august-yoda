import {ObjectId} from "mongodb";
import {DateTime} from "luxon";
import {mongoCollection} from "@/yoda/api/util.js";
import {Application} from "express"
import {GraphBuilder} from "@/obiwan/BuildGraph";

export async function register(app: Application) {
  app.get("/graph", async (req, res) => {
    const userId = req.query.userId;
    if (!userId) {
      return res.status(404).send('Not found')
    }
    const graph = new GraphBuilder("opportunity")
    res.promise(graph.buildGraph())
  })
}
