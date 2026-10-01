// src/controllers/catalogueImport.controller.ts — admin catalogue and opening-stock import
// The workbook is read from memory (multer memoryStorage) and discarded; nothing
// is written to disk (standing rule). The blank template is served from the repo.
import path from 'path';
import fs from 'fs';
import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { AppError } from '../utils/AppError';
import { commitCatalogue, previewCatalogue } from '../services/catalogueImport/apply';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export const catalogueUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype === XLSX || /\.xlsx$/i.test(file.originalname)),
}).single('file');

function fileOf(req: Request): Buffer {
  if (!req.file?.buffer) throw new AppError('Attach the filled-in .xlsx template as "file"', 422);
  return req.file.buffer;
}

export async function postPreview(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await previewCatalogue(fileOf(req)) }); } catch (err) { next(err); }
}

export async function postCommit(req: Request, res: Response, next: NextFunction) {
  try {
    const skip = req.query.skip_errors === 'true' || req.body?.skip_errors === 'true';
    res.json({ success: true, data: await commitCatalogue(req.user!.id, fileOf(req), skip) });
  } catch (err) { next(err); }
}

export async function getTemplate(_req: Request, res: Response, next: NextFunction) {
  try {
    const candidates = [process.env.TEMPLATES_DIR, path.resolve(__dirname, '../../../templates'), path.resolve(__dirname, '../../templates')]
      .filter(Boolean).map((d) => path.join(d as string, '01_Medicine_and_Inventory.xlsx'));
    const file = candidates.find((f) => fs.existsSync(f));
    if (!file) throw new AppError('Template not available on this server', 404);
    res.setHeader('Content-Type', XLSX);
    res.setHeader('Content-Disposition', 'attachment; filename="01_Medicine_and_Inventory.xlsx"');
    fs.createReadStream(file).pipe(res);
  } catch (err) { next(err); }
}
