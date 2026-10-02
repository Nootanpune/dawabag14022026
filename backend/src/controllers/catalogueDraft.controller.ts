// src/controllers/catalogueDraft.controller.ts — Sprint 29: draft products made from
// partner requests (admin) and the pharmacist's "New products to complete" queue.
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { createDraftsFromRequests, MAX_DRAFT_BATCH } from '../services/catalogueDrafts/create.service';
import { bulkSetDrafts, draftOptions, getDraft, listDrafts, saveDraft } from '../services/catalogueDrafts/queue.service';
import { approveDraft, rejectDraft } from '../services/catalogueDrafts/decide.service';
import { DOSAGE_FORMS, GST_RATES, HSN_RE, SCHEDULES } from '../services/catalogueDrafts/rules';

const uuid = z.string().uuid();
const text = (max: number) => z.string().trim().max(max).transform((s) => s || null).nullable();
const hsn = z.string().trim().transform((s) => s.replace(/\s/g, '') || null)
  .refine((s) => s === null || HSN_RE.test(s), 'HSN code must be 4, 6 or 8 digits').nullable();
const gst = z.number().int().refine((n) => (GST_RATES as readonly number[]).includes(n), 'GST rate must be 0, 5, 12, 18 or 28').nullable();

// POST /admin/partner-product-requests/drafts  { request_ids } | { all_open: true }
const createSchema = z.union([
  z.object({ request_ids: z.array(uuid).min(1).max(MAX_DRAFT_BATCH) }).strict(),
  z.object({ all_open: z.literal(true) }).strict(),
]);

export async function postCreateDrafts(req: Request, res: Response, next: NextFunction) {
  try {
    const body = createSchema.parse(req.body ?? {});
    const ids = 'request_ids' in body ? body.request_ids : null;
    res.status(201).json({ success: true, data: await createDraftsFromRequests(req.user!.id, ids) });
  } catch (err) { next(err); }
}

const listQuery = z.object({
  status: z.enum(['open', 'done', 'all']).default('open'),
  company: z.string().trim().max(255).optional(),
  needs_schedule: z.enum(['true', 'false']).optional().transform((v) => v === 'true'),
  cold_chain: z.enum(['yes', 'no', 'undecided']).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export async function getDrafts(req: Request, res: Response, next: NextFunction) {
  try {
    const f = listQuery.parse(req.query);
    res.json({ success: true, data: await listDrafts({ ...f, company: f.company || undefined, q: f.q || undefined }) });
  } catch (err) { next(err); }
}

export async function getDraftOptions(_req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await draftOptions() }); } catch (err) { next(err); }
}

export async function getOneDraft(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await getDraft(uuid.parse(req.params.productId)) }); } catch (err) { next(err); }
}

// Save as you go (one or more fields); the schedule is chosen per product, never in bulk
const saveSchema = z.object({
  name: z.string().trim().min(2).max(500),
  generic_name: text(500),
  composition: text(2000),
  strength: text(100),
  dosage_form: z.enum(DOSAGE_FORMS).nullable(),
  drug_schedule: z.enum(SCHEDULES).nullable(),
  cold_chain: z.boolean(),
  hsn_code: hsn,
  gst_rate: gst,
  category: text(100),
  description: text(2000),
  storage_instructions: text(500),
  net_quantity: text(50),
  marketed_by: text(255),
  manufacturer_name: text(255),
  manufacturer_address: text(1000),
  country_of_origin: text(60),
}).partial().strict();

export async function patchDraft(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await saveDraft(uuid.parse(req.params.productId), req.user!.id, saveSchema.parse(req.body ?? {})) });
  } catch (err) { next(err); }
}

// Non-clinical fields only: .strict() refuses drug_schedule or any clinical key
const bulkSchema = z.object({
  product_ids: z.array(uuid).min(1).max(500),
  set: z.object({
    category: text(100), hsn_code: hsn, manufacturer_name: text(255), manufacturer_address: text(1000), country_of_origin: text(60),
  }).partial().strict(),
}).strict();

export async function postBulkSet(req: Request, res: Response, next: NextFunction) {
  try {
    const { product_ids, set } = bulkSchema.parse(req.body ?? {});
    res.json({ success: true, data: await bulkSetDrafts(product_ids, req.user!.id, set) });
  } catch (err) { next(err); }
}

export async function postApproveDraft(req: Request, res: Response, next: NextFunction) {
  try {
    const { notes } = z.object({ notes: z.string().trim().max(1000).optional() }).parse(req.body ?? {});
    res.json({ success: true, data: await approveDraft(uuid.parse(req.params.productId), req.user!.id, notes) });
  } catch (err) { next(err); }
}

export async function postRejectDraft(req: Request, res: Response, next: NextFunction) {
  try {
    const { reason } = z.object({ reason: z.string().trim().min(3).max(500) }).parse(req.body ?? {});
    res.json({ success: true, data: await rejectDraft(uuid.parse(req.params.productId), req.user!.id, reason) });
  } catch (err) { next(err); }
}
