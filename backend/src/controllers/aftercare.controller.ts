// src/controllers/aftercare.controller.ts — cancellation, returns, refunds (Rulebook C-37)
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { cancelOrder } from '../services/cancellation.service';
import { RETURN_REASONS, createReturn, returnWindows, decideReturn, getReturn, listReturns, recordDisposition } from '../services/return.service';
import { listRefunds, markRefundProcessed, retryGatewayRefund } from '../services/refund.service';

const uuid = z.string().uuid();
export const STAFF_ROLES = ['admin', 'super_admin', 'pharmacist_rx', 'pharmacist_pack'];

// POST /orders/:id/cancel {reason}
export async function postCancelOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const { reason } = z.object({ reason: z.string().trim().min(3).max(500) }).parse(req.body);
    const staff = STAFF_ROLES.includes(req.user!.role);
    res.json({ success: true, data: await cancelOrder(uuid.parse(req.params.id), { id: req.user!.id, staff }, reason) });
  } catch (err) { next(err); }
}

// Buyer returns
export async function postReturn(req: Request, res: Response, next: NextFunction) {
  try {
    const d = z.object({
      shipment_id: uuid,
      reason: z.enum(RETURN_REASONS),
      description: z.string().trim().min(10).max(2000),
      items: z.array(z.object({ order_item_id: uuid, quantity: z.number().int().min(1).max(10000) })).min(1)
        .refine((a) => new Set(a.map((i) => i.order_item_id)).size === a.length, 'Each item once'),
    }).parse(req.body);
    res.status(201).json({ success: true, data: await createReturn(req.user!.id, d) });
  } catch (err) { next(err); }
}

export async function getMyReturns(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: { returns: await listReturns({ userId: req.user!.id }) } }); } catch (err) { next(err); }
}

export async function getOneReturn(req: Request, res: Response, next: NextFunction) {
  try {
    const staff = STAFF_ROLES.includes(req.user!.role);
    res.json({ success: true, data: await getReturn(uuid.parse(req.params.id), staff ? {} : { userId: req.user!.id }) });
  } catch (err) { next(err); }
}

// Staff
export async function getAllReturns(req: Request, res: Response, next: NextFunction) {
  try {
    const status = z.enum(['requested', 'approved', 'rejected', 'closed']).optional().parse(req.query.status);
    res.json({ success: true, data: { returns: await listReturns({ status }) } });
  } catch (err) { next(err); }
}

export async function postDecideReturn(req: Request, res: Response, next: NextFunction) {
  try {
    const d = z.object({ approve: z.boolean(), notes: z.string().trim().min(3).max(1000) }).parse(req.body);
    res.json({ success: true, data: await decideReturn(req.user!.id, uuid.parse(req.params.id), d.approve, d.notes) });
  } catch (err) { next(err); }
}

export async function postCloseReturn(req: Request, res: Response, next: NextFunction) {
  try {
    const { disposition } = z.object({ disposition: z.enum(['destroyed', 'returned_to_supplier', 'not_collected']) }).parse(req.body);
    res.json({ success: true, data: await recordDisposition(req.user!.id, uuid.parse(req.params.id), disposition) });
  } catch (err) { next(err); }
}

// Refunds
export async function getMyRefunds(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: { refunds: await listRefunds({ userId: req.user!.id }) } }); } catch (err) { next(err); }
}

export async function getAllRefunds(req: Request, res: Response, next: NextFunction) {
  try {
    const q = z.object({ status: z.enum(['pending', 'processed', 'failed']).optional(), order_id: uuid.optional() }).parse(req.query);
    res.json({ success: true, data: { refunds: await listRefunds({ status: q.status, orderId: q.order_id }) } });
  } catch (err) { next(err); }
}

export async function postRefundProcessed(req: Request, res: Response, next: NextFunction) {
  try {
    const { reference } = z.object({ reference: z.string().trim().min(3).max(100) }).parse(req.body);
    res.json({ success: true, data: await markRefundProcessed(req.user!.id, uuid.parse(req.params.id), reference) });
  } catch (err) { next(err); }
}

// GET /returns/windows — public; the time limits for reporting problems (C-37)
export async function getReturnWindows(_req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await returnWindows() }); } catch (err) { next(err); }
}

// POST /returns/refunds/admin/:id/retry — send a refused or failed gateway refund again
export async function postRefundRetry(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await retryGatewayRefund(req.user!.id, z.string().uuid().parse(req.params.id)) }); } catch (e) { next(e); }
}
