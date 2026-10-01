// src/controllers/stockControl.controller.ts — batches, adjustments, destruction register, stock counts
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { toCsv } from '../utils/csv';
import { listBatches } from '../services/stock/batches.service';
import { getSetting } from '../services/settings.service';
import { REASONS, decideAdjustment, destructionRegister, listAdjustments, recordDisposal, requestAdjustment } from '../services/stock/adjustment.service';
import { approveCount, getCount, listCounts, recordCounts, startCount, submitCount } from '../services/stock/stockCount.service';

const uuid = z.string().uuid();

export async function getBatches(req: Request, res: Response, next: NextFunction) {
  try {
    const f = z.object({
      q: z.string().trim().max(100).optional(), product_id: uuid.optional(), expiry: z.enum(['expired', 'near', 'ok']).optional(),
      page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(200).default(50),
    }).parse(req.query);
    res.json({ success: true, data: { batches: await listBatches(f), near_expiry_days: Number(await getSetting('stock.near_expiry_days', 90)) } });
  } catch (e) { next(e); }
}

export async function postAdjustment(req: Request, res: Response, next: NextFunction) {
  try {
    const d = z.object({
      batch_id: uuid, quantity_delta: z.number().int().refine((n) => n !== 0, 'Quantity cannot be zero'),
      reason: z.enum(REASONS), notes: z.string().trim().min(5).max(1000),
    }).parse(req.body);
    res.status(201).json({ success: true, data: await requestAdjustment(req.user!.id, d) });
  } catch (e) { next(e); }
}
export async function getAdjustments(req: Request, res: Response, next: NextFunction) {
  try {
    const status = z.enum(['requested', 'approved', 'rejected']).optional().parse(req.query.status);
    res.json({ success: true, data: { adjustments: await listAdjustments(status) } });
  } catch (e) { next(e); }
}
export async function postDecideAdjustment(req: Request, res: Response, next: NextFunction) {
  try {
    const d = z.object({ approve: z.boolean(), notes: z.string().trim().min(3).max(1000) }).parse(req.body);
    res.json({ success: true, data: await decideAdjustment(req.user!.id, uuid.parse(req.params.id), d.approve, d.notes) });
  } catch (e) { next(e); }
}
export async function postDisposal(req: Request, res: Response, next: NextFunction) {
  try {
    const d = z.object({
      method: z.enum(['incineration', 'authorised_vendor', 'returned_to_manufacturer']),
      reference: z.string().trim().min(3).max(100), witness: z.string().trim().min(3).max(150),
    }).parse(req.body);
    res.json({ success: true, data: await recordDisposal(req.user!.id, uuid.parse(req.params.id), d) });
  } catch (e) { next(e); }
}
export async function getDestructionRegister(req: Request, res: Response, next: NextFunction) {
  try {
    const entries = await destructionRegister(req.query.pending === 'true');
    if (req.query.format !== 'csv') return res.json({ success: true, data: { entries } });
    // Destruction register for the inspector (Drugs Rules; C-28, C-34)
    const cols = ['adjustment_no', 'product_name', 'sku', 'drug_schedule', 'batch_number', 'expiry_date', 'quantity_delta', 'reason', 'value_paise',
      'requested_by_name', 'approved_by_name', 'decided_at', 'disposal_method', 'disposal_reference', 'disposal_witness', 'disposed_at'];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="destruction-register${req.query.pending === 'true' ? '-pending' : ''}.csv"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(toCsv(cols, entries as Record<string, unknown>[]));
  } catch (e) { next(e); }
}

export async function postCount(req: Request, res: Response, next: NextFunction) {
  try {
    const d = z.object({ label: z.string().trim().min(2).max(100), product_ids: z.array(uuid).max(500).optional(),
      storage_location: z.string().trim().min(1).max(100).optional() }).parse(req.body);
    res.status(201).json({ success: true, data: await startCount(req.user!.id, d) });
  } catch (e) { next(e); }
}
export async function getCounts(_req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: { counts: await listCounts() } }); } catch (e) { next(e); }
}
export async function getOneCount(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await getCount(uuid.parse(req.params.id)) }); } catch (e) { next(e); }
}
export async function putCountLines(req: Request, res: Response, next: NextFunction) {
  try {
    const { lines } = z.object({ lines: z.array(z.object({ batch_id: uuid, counted_qty: z.number().int().min(0).max(10_000_000) })).min(1).max(2000) }).parse(req.body);
    res.json({ success: true, data: await recordCounts(req.user!.id, uuid.parse(req.params.id), lines) });
  } catch (e) { next(e); }
}
export async function postSubmitCount(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await submitCount(req.user!.id, uuid.parse(req.params.id)) }); } catch (e) { next(e); }
}
export async function postApproveCount(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await approveCount(req.user!.id, uuid.parse(req.params.id)) }); } catch (e) { next(e); }
}
