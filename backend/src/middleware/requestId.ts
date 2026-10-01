// Every request gets an id, returned as X-Request-Id and written on its access-log and
// error lines, so a user's "reference" from an error screen leads straight to the logs.
// An id sent by the load balancer or the web app is kept when it is a plain token.
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request { id?: string }
  }
}

const SAFE = /^[A-Za-z0-9._-]{8,64}$/;

export function requestId(req: Request, res: Response, next: NextFunction) {
  const given = req.get('x-request-id');
  req.id = given && SAFE.test(given) ? given : randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
}
