// src/controllers/purchaseReturn.controller.ts — goods returned to suppliers (C-28)
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { RETURN_REASONS, decideReturn, dispatchReturn, getReturn, listReturns, requestReturn, settleReturn } from '../services/purchasing/purchaseReturn.service';

const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export async function postPurchaseReturn(req: Request, res: Response, next: NextFunction) {
  try {
    const d = z.object({
      vendor_id: uuid, reason: z.enum(RETURN_REASONS), notes: z.string().trim().min(3).max(1000),
      lines: z.array(z.object({ batch_id: uuid, quantity: z.number().int().positive().max(100000) })).min(1).max(200)
        .refine((l) => new Set(l.map((x) => x.batch_id)).size === l.length, 'Each batch once per return'),
    }).parse(req.body);
    res.status(201).json({ success: true, data: await requestReturn(req.user!.id, d) });
  } catch (e) { next(e); }
}
export async function getPurchaseReturns(req: Request, res: Response, next: NextFunction) {
  try {
    const { status } = z.object({ status: z.enum(['requested', 'approved', 'dispatched', 'settled', 'rejected']).optional() }).parse(req.query);
    res.json({ success: true, data: { returns: await listReturns(status) } });
  } catch (e) { next(e); }
}
export async function getOnePurchaseReturn(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await getReturn(uuid.parse(req.params.id)) }); } catch (e) { next(e); }
}
export async function postDecidePurchaseReturn(req: Request, res: Response, next: NextFunction) {
  try {
    const d = z.object({ approve: z.boolean(), notes: z.string().trim().min(3).max(500) }).parse(req.body);
    res.json({ success: true, data: await decideReturn(req.user!.id, uuid.parse(req.params.id), d.approve, d.notes) });
  } catch (e) { next(e); }
}
export async function postDispatchPurchaseReturn(req: Request, res: Response, next: NextFunction) {
  try {
    const d = z.object({ dispatch_reference: z.string().trim().min(3).max(100) }).parse(req.body);
    res.json({ success: true, data: await dispatchReturn(req.user!.id, uuid.parse(req.params.id), d.dispatch_reference) });
  } catch (e) { next(e); }
}
export async function postSettlePurchaseReturn(req: Request, res: Response, next: NextFunction) {
  try {
    const d = z.object({ supplier_credit_note_no: z.string().trim().min(1).max(60), supplier_credit_note_date: date,
      supplier_credit_paise: z.number().int().min(0) }).parse(req.body);
    res.json({ success: true, data: await settleReturn(req.user!.id, uuid.parse(req.params.id),
      { number: d.supplier_credit_note_no, date: d.supplier_credit_note_date, amount_paise: d.supplier_credit_paise }) });
  } catch (e) { next(e); }
}
