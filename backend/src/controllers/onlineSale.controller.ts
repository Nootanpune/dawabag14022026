// Online-sale status per product (Sprint 39): staff list, single and bulk changes,
// history. Rules in services/onlineSale/rules.ts.
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ONLINE_SALE_STATUSES } from '../services/onlineSale/rules';
import { MAX_BULK, listOnlineStatus, onlineStatusCounts, onlineStatusLog, setOnlineStatus } from '../services/onlineSale/status.service';

const change = z.object({
  status: z.enum(ONLINE_SALE_STATUSES),
  notification_ref: z.string().trim().max(200).nullable().optional(),
  notification_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter the date as YYYY-MM-DD').nullable().optional(),
  reason: z.string().trim().max(1000).nullable().optional(),
  new_drug_confirmation: z.string().trim().max(1000).nullable().optional(),   // Sprint 40: new drugs (NDCT Rules 2019)
});

export async function getOnlineStatusList(req: Request, res: Response, next: NextFunction) {
  try {
    const f = z.object({ status: z.enum(ONLINE_SALE_STATUSES).optional(), q: z.string().max(100).optional(),
      limit: z.coerce.number().int().optional() }).parse(req.query);
    res.json({ success: true, data: { products: await listOnlineStatus(f), counts: await onlineStatusCounts() } });
  } catch (e) { next(e); }
}

export async function putProductOnlineStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const id = z.string().uuid().parse(req.params.productId);
    res.json({ success: true, data: await setOnlineStatus({ id: req.user!.id, role: req.user!.role }, [id], change.parse(req.body)) });
  } catch (e) { next(e); }
}

export async function postBulkOnlineStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const d = change.extend({ product_ids: z.array(z.string().uuid()).min(1).max(MAX_BULK) }).parse(req.body);
    const { product_ids, ...input } = d;
    res.json({ success: true, data: await setOnlineStatus({ id: req.user!.id, role: req.user!.role }, product_ids, input) });
  } catch (e) { next(e); }
}

export async function getProductOnlineStatusLog(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await onlineStatusLog(z.string().uuid().parse(req.params.productId)) }); } catch (e) { next(e); }
}
