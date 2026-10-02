// src/controllers/partnerStockImport.controller.ts — partner stock import (Sprint 27)
// The file is read from memory (multer memoryStorage) and discarded; only the parsed
// rows are kept in PostgreSQL (standing rule: nothing written to disk).
import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { AppError } from '../utils/AppError';
import { FIELD_KEYS } from '../services/partnerStockImport/fields';
import { MAX_FILE_BYTES } from '../services/partnerStockImport/readFile';
import {
  cancelImport, createImport, getImport, linkRow, listImports, listProductRequests, listRows, recheckImport,
  REQUEST_STATUSES, requestNewProducts, resolveProductRequest, ROW_TABS, setMapping, unlinkRow,
} from '../services/partnerStockImport/import.service';
import { applyImport } from '../services/partnerStockImport/apply.service';

const ACCEPTED = /\.(xlsx|xls|csv|txt|tsv)$/i;

export const stockFileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => (ACCEPTED.test(file.originalname)
    ? cb(null, true) : cb(new AppError('Upload the stock export as Excel (.xlsx / .xls) or CSV', 422))),
}).single('file');

const uuid = z.string().uuid();
const partnerOf = (req: Request) => req.partner!.vendorId;

export async function postStockImport(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file?.buffer) throw new AppError('Attach the stock file as "file"', 422);
    const data = await createImport(partnerOf(req), req.user!.id, { buffer: req.file.buffer, originalname: req.file.originalname, size: req.file.size });
    res.status(201).json({ success: true, data: await getImport(data.id, partnerOf(req)) });
  } catch (err) { next(err); }
}

export async function getStockImports(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: { imports: await listImports(partnerOf(req)) } }); } catch (err) { next(err); }
}

export async function getStockImport(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await getImport(uuid.parse(req.params.id), partnerOf(req)) }); } catch (err) { next(err); }
}

const rowsQuery = z.object({
  status: z.enum(ROW_TABS).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export async function getStockImportRows(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await listRows(uuid.parse(req.params.id), partnerOf(req), rowsQuery.parse(req.query)) });
  } catch (err) { next(err); }
}

const mappingSchema = z.object({
  mapping: z.object(Object.fromEntries(FIELD_KEYS.map((k) => [k, z.number().int().min(0).max(200).nullable().optional()]))),
});

export async function putStockImportMapping(req: Request, res: Response, next: NextFunction) {
  try {
    const { mapping } = mappingSchema.parse(req.body);
    const summary = await setMapping(uuid.parse(req.params.id), partnerOf(req), req.user!.id, mapping);
    res.json({ success: true, data: { summary } });
  } catch (err) { next(err); }
}

export async function postStockImportRecheck(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: { summary: await recheckImport(uuid.parse(req.params.id), partnerOf(req)) } }); } catch (err) { next(err); }
}

const linkSchema = z.union([
  z.object({ product_id: uuid }),
  z.object({ product_id: z.null() }),
]);

/** PATCH /partner/stock-imports/:id/rows/:rowId  { product_id } links; { product_id: null } forgets the link */
export async function patchStockImportRow(req: Request, res: Response, next: NextFunction) {
  try {
    const body = linkSchema.parse(req.body);
    const id = uuid.parse(req.params.id);
    const rowId = uuid.parse(req.params.rowId);
    const data = body.product_id
      ? await linkRow(id, rowId, partnerOf(req), req.user!.id, body.product_id)
      : await unlinkRow(id, rowId, partnerOf(req), req.user!.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

const requestSchema = z.object({ row_ids: z.array(uuid).min(1).max(10_000).optional() });

export async function postRequestNewProducts(req: Request, res: Response, next: NextFunction) {
  try {
    const { row_ids } = requestSchema.parse(req.body ?? {});
    res.json({ success: true, data: await requestNewProducts(uuid.parse(req.params.id), partnerOf(req), req.user!.id, row_ids ?? null) });
  } catch (err) { next(err); }
}

const applySchema = z.object({
  catalogue_price_accepted: z.boolean().optional(),
  cold_chain_confirmed: z.boolean().optional(),
  h1_pharmacist_name: z.string().trim().max(200).optional(),
  h1_pharmacist_reg_no: z.string().trim().max(100).optional(),
  h1_secure_storage_declared: z.boolean().optional(),
});

export async function postApplyStockImport(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await applyImport(uuid.parse(req.params.id), partnerOf(req), req.user!.id, applySchema.parse(req.body ?? {}));
    res.json({ success: true, data: { result } });
  } catch (err) { next(err); }
}

export async function postCancelStockImport(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await cancelImport(uuid.parse(req.params.id), partnerOf(req), req.user!.id) }); } catch (err) { next(err); }
}

// ── Admin (read every partner's imports; resolve new-product requests) ───────
export async function adminListStockImports(req: Request, res: Response, next: NextFunction) {
  try {
    const partnerId = req.query.partner_id ? uuid.parse(req.query.partner_id) : null;
    res.json({ success: true, data: { imports: await listImports(partnerId, 200) } });
  } catch (err) { next(err); }
}

export async function adminGetStockImport(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await getImport(uuid.parse(req.params.id), null) }); } catch (err) { next(err); }
}

export async function adminGetStockImportRows(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await listRows(uuid.parse(req.params.id), null, rowsQuery.parse(req.query)) }); } catch (err) { next(err); }
}

export async function adminListProductRequests(req: Request, res: Response, next: NextFunction) {
  try {
    const status = z.enum(REQUEST_STATUSES).default('open').parse(req.query.status);
    res.json({ success: true, data: { requests: await listProductRequests(status) } });
  } catch (err) { next(err); }
}

const resolveSchema = z.union([
  z.object({ product_id: uuid }),
  z.object({ reject_reason: z.string().trim().min(3).max(500) }),
]);

export async function adminResolveProductRequest(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await resolveProductRequest(uuid.parse(req.params.id), req.user!.id, resolveSchema.parse(req.body)) });
  } catch (err) { next(err); }
}
