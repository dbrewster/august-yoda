import {Collection, Document, MongoClient} from "mongodb";

export interface DocumentWithStringId extends Document {
    [_id: string]: string
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

export class AsyncBlockingQueue<T> {
    private _promises: Promise<T>[];
    private _resolvers: ((t: T) => void)[];

    constructor() {
        this._resolvers = [];
        this._promises = [];
    }

    private _add() {
        this._promises.push(new Promise(resolve => {
            this._resolvers.push(resolve);
        }));
    }

    enqueue(t: T) {
        if (!this._resolvers.length) this._add();
        const resolve = this._resolvers.shift()!;
        resolve(t);
    }

    dequeue() {
        if (!this._promises.length) this._add();
        const promise = this._promises.shift()!;
        return promise;
    }

    isEmpty() {
        return !this._promises.length;
    }

    isBlocked() {
        return !!this._resolvers.length;
    }

    get length() {
        return this._promises.length - this._resolvers.length;
    }
}

class AsyncSemaphore {
    private promises = Array<(value: any) => void>()
    private maxPermits: number;

    constructor(private permits: number) {
        this.maxPermits = permits
    }

    signal() {
        this.permits += 1
        if (this.promises.length > 0) {
            // @ts-ignore
            this.promises.pop()()
        }
    }

    async wait() {
        if (this.permits == 0 || this.promises.length > 0)
            await new Promise(r => this.promises.unshift(r))
        this.permits -= 1
    }
}

export const batchPromises = async <T>(promises: Promise<T>[], batchSize: number) => {
    const sema = new AsyncSemaphore(batchSize)
    const results: T[] = []
    for (const promise of promises) {
        await sema.wait()
        // DO NOT await this. We are doing that below.
        promise.then(v => {
            results.push(v)
            sema.signal()
        })
    }
    // wait for the remaining items to finish
    await Promise.all(promises)
    return results
}

export function convertCamelCaseToLower(str: string) {
    // 1) Removes any case of "id" from the string
    let result = str.replace(/id/gi, '');

    // 2 & 3) Turns a camel cased string into a lower case string
    // with the cases separated by an underscore, treating consecutive
    // uppercase letters as a "word"
    result = result.replace(/([a-z])([A-Z])/g, '$1_$2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
        .toLowerCase();

    // Convert first character to lowercase
    result = result.charAt(0).toLowerCase() + result.slice(1);

    // Remove occurrences of '_c'
    result = result.replace(/_c/g, '');

    // Trim trailing or leading spaces or `_` characters
    result = result.replace(/^[_\s]+|[_\s]+$/g, '');

    return result;
}

export function snakeToPascalCase(str: string) {
    return str
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join('');
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
