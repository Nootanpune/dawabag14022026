// Sprint 46 — import catalogue suggestions for one partner's DRAFT products (owner
// request 2026-10-04). The workbook is read from memory (multer memoryStorage) and
// discarded; only the suggestions are kept, in PostgreSQL (standing rule). Request
// parsing only — the rules are in services/catalogueSuggestions (C-10, C-19, C-46).
import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { AppError } from '../utils/AppError';
import { importSuggestions } from '../services/catalogueSuggestions/import.service';
import { ALLOWED_VALUES, MAX_SUGGESTION_FILE_BYTES, buildSuggestionTemplate } from '../services/catalogueSuggestions/workbook';
import { OPTIONAL_SUGGESTION_COLUMNS, SUGGESTION_COLUMNS } from '../services/catalogueSuggestions/sheet';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export const suggestionsFileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SUGGESTION_FILE_BYTES, files: 1, fields: 5 },
  fileFilter: (_req, file, cb) => (/\.xlsx$/i.test(file.originalname)
    ? cb(null, true) : cb(new AppError('Upload the suggestions as an Excel workbook (.xlsx)', 422))),
}).single('file');

// POST /catalogue-suggestions/imports (multipart: file, partner_id)
export async function postSuggestionsImport(req: Request, res: Response, next: NextFunction) {
  try {
    const d = z.object({ partner_id: z.string({ required_error: 'Choose the partner' }).uuid('Choose the partner') }).parse(req.body ?? {});
    if (!req.file?.buffer) throw new AppError('Attach the suggestions workbook as "file"', 422);
    const data = await importSuggestions(req.user!.id, d.partner_id, { buffer: req.file.buffer, originalname: req.file.originalname });
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

// GET /catalogue-suggestions/template — an empty workbook made on the fly
export async function getSuggestionsTemplate(_req: Request, res: Response, next: NextFunction) {
  try {
    const buf = await buildSuggestionTemplate();
    res.setHeader('Content-Type', XLSX);
    res.setHeader('Content-Disposition', 'attachment; filename="catalogue_suggestions_template.xlsx"');
    res.send(buf);
  } catch (err) { next(err); }
}

// GET /catalogue-suggestions/format — the columns and the values each one accepts
export async function getSuggestionsFormat(_req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: { sheet: 'suggestions', columns: SUGGESTION_COLUMNS, optional_columns: OPTIONAL_SUGGESTION_COLUMNS, allowed: ALLOWED_VALUES } }); } catch (err) { next(err); }
}
