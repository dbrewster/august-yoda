import {Request, Response} from "express";
import http from "http";
import {rootLogger} from "@/util/RootLogger";
import winston from "winston"

declare module "express-serve-static-core" {
  interface Response<
    ResBody = any,
    LocalsObj extends Record<string, any> = Record<string, any>,
    StatusCode extends number = number
  > extends http.ServerResponse {
    promise: (p: (Promise<any> | any)) => any
  }
}
const handleResponse = (logger: winston.Logger, res: Response, data: any) => {
  logger.info("http response:  200")
  return res.status(200).send(data);
}
const handleError = (logger: winston.Logger, res: Response, err: any = {}) => {
  if (err.status && err.status < 500) {
    logger.warn(`http response: ${err.status}`)
  } else {
    logger.error("http response: 500", err)
    console.log(err.stack)
  }
  return res.status(err.status || 500).send({error: err.message});
}

export function promiseMiddleware(logger: winston.Logger = rootLogger) {
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
          return handleResponse(logger, res, data)
        })
        .catch((e: any) => {
          handleError(logger, res, e)
        });
    };
    return next();
  };
}