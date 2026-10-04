// Who may buy a product (Sprint 47): set (pharmacist), history and the restricted list
// (pharmacists and admins). Rules in services/buyerRestriction/rules.ts.
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { BUYER_RESTRICTIONS } from '../services/buyerRestriction/rules';
import { buyerRestrictionLog, restrictedProducts, setBuyerRestriction } from '../services/buyerRestriction/status.service';

export const restrictionChange = z.object({
  restriction: z.enum(BUYER_RESTRICTIONS),
  reason: z.string().trim().max(1000),
});

export async function putBuyerRestriction(req: Request, res: Response, next: NextFunction) {
  try {
    const id = z.string().uuid().parse(req.params.productId);
    res.json({ success: true, data: await setBuyerRestriction({ id: req.user!.id, role: req.user!.role }, id, restrictionChange.parse(req.body ?? {})) });
  } catch (e) { next(e); }
}

export async function getBuyerRestrictionLog(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await buyerRestrictionLog(z.string().uuid().parse(req.params.productId)) }); } catch (e) { next(e); }
}

export async function getRestrictedProducts(_req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await restrictedProducts() }); } catch (e) { next(e); }
}
