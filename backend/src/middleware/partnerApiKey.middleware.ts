// src/middleware/partnerApiKey.middleware.ts — Sprint 36: machine access for a
// partner's billing software (stock feed). The key comes only from
// "Authorization: Bearer <key>" (never the URL, so it never reaches access logs) and
// must be scoped to the partner named in the path (C-44, C-46).
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '../utils/AppError';
import { keyFromHeader } from '../services/partnerApiKeys/keys';
import { authenticateKey, FeedCaller, KeyScope, takeUploadSlot } from '../services/partnerApiKeys/keys.service';

declare global {
  namespace Express {
    interface Request {
      partnerKey?: FeedCaller;
    }
  }
}

export const clientIp = (req: Request) => req.ip ?? null;

export function requirePartnerKey(scope: KeyScope) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const partnerId = z.string().uuid().safeParse(req.params.partnerId);
      if (!partnerId.success) throw new AppError('Partner not found', 404);
      req.partnerKey = await authenticateKey(keyFromHeader(req.headers.authorization), partnerId.data, scope, clientIp(req), req.baseUrl + req.path);
      next();
    } catch (err) { next(err); }
  };
}

/** One upload slot from the key's hourly allowance, taken BEFORE the file is read. */
export async function stockFeedRateLimit(req: Request, _res: Response, next: NextFunction) {
  try {
    await takeUploadSlot(req.partnerKey!, clientIp(req), req.baseUrl + req.path);
    next();
  } catch (err) { next(err); }
}
