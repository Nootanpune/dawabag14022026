// GDP records per batch (Sprint 40; handover D17 / D19; C-25, C-28, C-34): Dawabag's store
// staff record events on Dawabag's batches and see every batch; a Dawabag pharmacist
// decides excursions on Dawabag's batches; partners record and decide on their own
// batches (partner routes below). Rules in services/gdp/rules.ts.
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { DISPOSITIONS, GDP_STATUSES, MANUAL_KINDS } from '../services/gdp/rules';
import { batchLog, listGdpBatches, pendingExcursions, recordEvent } from '../services/gdp/record.service';
import { decideExcursion } from '../services/gdp/disposition.service';

const uuid = z.string().uuid();
const eventSchema = z.object({
  event_kind: z.enum(MANUAL_KINDS),
  temperature_c: z.number().min(-80).max(80).nullable().optional(),
  storage_condition: z.string().trim().max(160).nullable().optional(),
  location: z.string().trim().max(100).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
}).strict();
const dispositionSchema = z.object({ disposition: z.enum(DISPOSITIONS), justification: z.string().trim().max(2000) });
const listSchema = z.object({
  q: z.string().trim().max(100).optional(), status: z.enum(GDP_STATUSES).optional(),
  scope: z.enum(['own', 'partner', 'all']).optional(), cold: z.enum(['1', 'true']).optional(),
});

// ── Staff ────────────────────────────────────────────────────────────────────
export async function getGdpBatches(req: Request, res: Response, next: NextFunction) {
  try {
    const f = listSchema.parse(req.query);
    res.json({ success: true, data: { batches: await listGdpBatches({ q: f.q, status: f.status, scope: f.scope, coldOnly: !!f.cold }) } });
  } catch (e) { next(e); }
}

export async function getGdpBatchLog(req: Request, res: Response, next: NextFunction) {
  try {
    const kind = z.enum(['own', 'partner']).parse(req.params.kind);
    res.json({ success: true, data: await batchLog({ kind, id: uuid.parse(req.params.id) }) });
  } catch (e) { next(e); }
}

export async function postOwnGdpRecord(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(201).json({ success: true, data: await recordEvent({ kind: 'own', id: uuid.parse(req.params.id) }, eventSchema.parse(req.body ?? {}),
      { id: req.user!.id, source: 'staff' }) });
  } catch (e) { next(e); }
}

export async function getPendingExcursions(req: Request, res: Response, next: NextFunction) {
  try {
    const scope = z.enum(['own', 'partner', 'all']).optional().parse(req.query.scope);
    res.json({ success: true, data: { excursions: await pendingExcursions({ scope: scope ?? 'all' }) } });
  } catch (e) { next(e); }
}

export async function postStaffDisposition(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await decideExcursion({ kind: 'staff', userId: req.user!.id, role: req.user!.role },
      uuid.parse(req.params.id), dispositionSchema.parse(req.body ?? {})) });
  } catch (e) { next(e); }
}

// ── Partner portal: its own batches only ─────────────────────────────────────
export async function getPartnerGdpBatches(req: Request, res: Response, next: NextFunction) {
  try {
    const f = listSchema.parse(req.query);
    res.json({ success: true, data: { batches: await listGdpBatches({ q: f.q, status: f.status, coldOnly: !!f.cold, partnerId: req.partner!.vendorId }) } });
  } catch (e) { next(e); }
}

export async function getPartnerGdpBatchLog(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await batchLog({ kind: 'partner', id: uuid.parse(req.params.id) }, req.partner!.vendorId) }); } catch (e) { next(e); }
}

export async function postPartnerGdpRecord(req: Request, res: Response, next: NextFunction) {
  try {
    const id = uuid.parse(req.params.id);
    await batchLog({ kind: 'partner', id }, req.partner!.vendorId);   // 404 unless it is this partner's batch
    res.status(201).json({ success: true, data: await recordEvent({ kind: 'partner', id }, eventSchema.parse(req.body ?? {}),
      { id: req.user!.id, source: 'partner' }) });
  } catch (e) { next(e); }
}

export async function getPartnerPendingExcursions(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: { excursions: await pendingExcursions({ partnerId: req.partner!.vendorId }) } }); } catch (e) { next(e); }
}

export async function postPartnerDisposition(req: Request, res: Response, next: NextFunction) {
  try {
    const d = dispositionSchema.extend({ vendor_pharmacist_id: uuid }).parse(req.body ?? {});
    res.json({ success: true, data: await decideExcursion({ kind: 'partner', userId: req.user!.id, partnerId: req.partner!.vendorId,
      vendorPharmacistId: d.vendor_pharmacist_id }, uuid.parse(req.params.id), d) });
  } catch (e) { next(e); }
}
