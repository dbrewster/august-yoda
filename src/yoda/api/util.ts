import {Collection, Document, MongoClient} from "mongodb";
import {Response} from "express";

export interface DocumentWithStringId extends Document {
  [_id:string]: string
}

export async function mongoCollection<T extends Document>(colName: string): Promise<Collection<T>> {
  if (!process.env.MONGO_CONNECTION_STR) {
    console.error("MONGO_CONNECTION_STR is not defined in the .env file")
    throw "MONGO_CONNECTION_STR is not defined in the .env file"
  }
  if (!process.env.MONGO_DATABASE) {
    console.error("MONGO_DATABASE is not defined in the .env file")
    throw "MONGO_DATABASE is not defined in the .env file"
  }

  return MongoClient.connect(process.env.MONGO_CONNECTION_STR!).then(c => c.db(process.env.MONGO_DATABASE).collection(colName))
}

export function handleError(promise: Promise<any>, response: Response) {
  return promise.catch(e => {
    
  })
}
/*
export async function closeDownMongo() {
  if (!process.env.MONGO_CONNECTION_STR) {
    console.error("MONGO_CONNECTION_STR is not defined in the .env file")
    notFound()
  }
  if (!process.env.MONGO_DATABASE) {
    console.error("MONGO_DATABASE is not defined in the .env file")
    notFound()
  }
  return MongoClient.connect(process.env.MONGO_CONNECTION_STR!).then(c => c.close(true))
}
*/
