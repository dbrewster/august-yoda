import {Collection, Document, MongoClient} from "mongodb";

export interface DocumentWithStringId extends Document {
  [_id:string]: string
}

export function getOrThrowUserId(url: string) {
  console.log(url)
  return new URL(url).searchParams.get("userId");
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
