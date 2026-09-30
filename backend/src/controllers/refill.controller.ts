// src/controllers/refill.controller.ts — buyer refill subscriptions + mandates
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { cancelSubscription, createSubscription, listSubscriptions, updateSubscription } from '../services/refill.service';
import { cancelMandate, listMandates, startMandate } from '../services/mandate.service';

const uuid = z.string().uuid();
const frequency = z.number().int().min(7).max(180);

export async function getRefills(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: { refills: await listSubscriptions(req.user!.id) } }); } catch (err) { next(err); }
}

export async function postRefill(req: Request, res: Response, next: NextFunction) {
  try {
    const d = z.object({ order_id: uuid, frequency_days: frequency }).parse(req.body);
    res.status(201).json({ success: true, data: await createSubscription(req.user!.id, d.order_id, d.frequency_days) });
  } catch (err) { next(err); }
}

export async function patchRefill(req: Request, res: Response, next: NextFunction) {
  try {
    const d = z.object({
      frequency_days: frequency.optional(),
      is_active: z.boolean().optional(),
      mandate_id: uuid.nullable().optional(),
      items: z.array(z.object({ product_id: uuid, quantity: z.number().int().min(0).max(999) })).optional(),
    }).parse(req.body);
    await updateSubscription(req.user!.id, uuid.parse(req.params.id), d);
    res.json({ success: true, data: { refills: await listSubscriptions(req.user!.id) } });
  } catch (err) { next(err); }
}

export async function deleteRefill(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await cancelSubscription(req.user!.id, uuid.parse(req.params.id)) }); } catch (err) { next(err); }
}

export async function getMandates(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: { mandates: await listMandates(req.user!.id) } }); } catch (err) { next(err); }
}

export async function postMandate(req: Request, res: Response, next: NextFunction) {
  try {
    const d = z.object({ max_amount_paise: z.number().int().min(100), method: z.enum(['upi', 'card']) }).parse(req.body);
    res.status(201).json({ success: true, data: await startMandate(req.user!.id, d.max_amount_paise, d.method) });
  } catch (err) { next(err); }
}

export async function deleteMandate(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await cancelMandate(req.user!.id, uuid.parse(req.params.id)) }); } catch (err) { next(err); }
}
