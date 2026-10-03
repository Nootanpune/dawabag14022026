// Sprint 45 — import medicine-information drafts for one partner's products (owner
// request 2026-10-03). The workbook is read from memory (multer memoryStorage) and
// discarded; only the draft versions are kept, in PostgreSQL (standing rule). Request
// parsing only — the rules are in services/medicineInfo/importDrafts (C-19, C-46).
import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { AppError } from '../utils/AppError';
import { importInfoDrafts } from '../services/medicineInfo/importDrafts/import.service';
import { importPartners, importedDraftCounts, importedDrafts } from '../services/medicineInfo/importDrafts/queue.service';
import { MAX_DRAFT_FILE_BYTES, buildDraftTemplate } from '../services/medicineInfo/importDrafts/workbook';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export const draftsFileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_DRAFT_FILE_BYTES, files: 1, fields: 5 },
  fileFilter: (_req, file, cb) => (/\.xlsx$/i.test(file.originalname)
    ? cb(null, true) : cb(new AppError('Upload the drafts as an Excel workbook (.xlsx)', 422))),
}).single('file');

const truthy = z.union([z.boolean(), z.enum(['true', 'false', '1', '0', 'on', ''])]).optional()
  .transform((v) => v === true || v === 'true' || v === '1' || v === 'on');

// POST /medicines/info-imports (multipart: file, partner_id, replace_drafts)
export async function postInfoDraftsImport(req: Request, res: Response, next: NextFunction) {
  try {
    const d = z.object({ partner_id: z.string({ required_error: 'Choose the partner' }).uuid('Choose the partner'), replace_drafts: truthy }).parse(req.body ?? {});
    if (!req.file?.buffer) throw new AppError('Attach the drafts workbook as "file"', 422);
    const data = await importInfoDrafts(req.user!.id, d.partner_id, { buffer: req.file.buffer, originalname: req.file.originalname },
      { replaceDrafts: d.replace_drafts });
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

// GET /medicines/info-imports/template — an empty workbook made on the fly
export async function getInfoDraftsTemplate(_req: Request, res: Response, next: NextFunction) {
  try {
    const buf = await buildDraftTemplate();
    res.setHeader('Content-Type', XLSX);
    res.setHeader('Content-Disposition', 'attachment; filename="medicine_information_drafts_template.xlsx"');
    res.send(buf);
  } catch (err) { next(err); }
}

// GET /medicines/info-imports/partners
export async function getInfoImportPartners(_req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: { partners: await importPartners() } }); } catch (err) { next(err); }
}

// GET /medicines/info-imports/drafts?partner_id=&status=draft|pending_review
export async function getImportedDrafts(req: Request, res: Response, next: NextFunction) {
  try {
    const d = z.object({
      partner_id: z.string().uuid().optional(),
      status: z.enum(['draft', 'pending_review']).default('draft'),
    }).parse(req.query);
    res.json({ success: true, data: { versions: await importedDrafts(req.user!.id, d.partner_id ?? null, d.status) } });
  } catch (err) { next(err); }
}

// GET /medicines/info-imports/counts
export async function getImportedDraftCounts(_req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: { partners: await importedDraftCounts() } }); } catch (err) { next(err); }
}
