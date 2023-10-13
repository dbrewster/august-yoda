import {Request, Response} from "express";
import http from "http";
import {stat} from "fs";
import {rootLogger} from "@/util/RootLogger";

declare module "express-serve-static-core" {
  interface Response<
    ResBody = any,
    LocalsObj extends Record<string, any> = Record<string, any>,
    StatusCode extends number = number
  > extends http.ServerResponse {
    promise: (p: (Promise<any> | any)) => any
  }
}
const handleResponse = (res: Response, data: any) => {
  rootLogger.info("http response:  200")
  return res.status(200).send(data);
}
const handleError = (res: Response, err: any = {}) => {
  if (err.status && err.status < 500) {
    rootLogger.warn(`http response: ${err.status}`)
  } else {
    rootLogger.error("http response: 500", err)
  }
  return res.status(err.status || 500).send({error: err.message});
}

export function promiseMiddleware() {
  return (req: Request, res: Response, next: any) => {
    res.promise = (p) => {
      let promiseToResolve;
      if (p.then && p.catch) {
        promiseToResolve = p;
      } else if (typeof p === 'function') {
        promiseToResolve = Promise.resolve().then(() => p());
      } else {
        promiseToResolve = Promise.resolve(p);
      }

      return promiseToResolve
        .then((data: any) => {
          return handleResponse(res, data)
        })
        .catch((e: any) => {
          handleError(res, e)
        });
    };
    return next();
  };
}