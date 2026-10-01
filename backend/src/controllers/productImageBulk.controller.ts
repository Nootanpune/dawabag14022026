// src/controllers/productImageBulk.controller.ts — POST /products/images/bulk:
// many pack photos at once, each named after its product's SKU (multipart field
// "images"). Files are held in memory only (multer memoryStorage) and go
// straight to the server object store; nothing is written to the API disk.
// Every photo is sent to pharmacist review (C-19) and audit-logged (C-46).
import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { rateLimit } from 'express-rate-limit';
import { AppError } from '../utils/AppError';
import { BULK_PHOTO_MAX_FILES, bulkSetProductImages } from '../services/productImageBulk.service';

// A file over 2 MB is reported in its own result (utils/imageCheck); this hard cap
// only stops absurd files. The whole request is capped too, so one batch holds at
// most ~60 MB in memory.
const HARD_FILE_BYTES = 8 * 1024 * 1024;
export const BULK_PHOTO_MAX_REQUEST_BYTES = 60 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: HARD_FILE_BYTES, files: BULK_PHOTO_MAX_FILES, fields: 5, parts: BULK_PHOTO_MAX_FILES + 5 },
}).array('images', BULK_PHOTO_MAX_FILES);

const MULTER_MESSAGES: Record<string, [number, string]> = {
  LIMIT_FILE_SIZE: [413, 'A file is over 8 MB; photos must be 2 MB or smaller'],
  LIMIT_FILE_COUNT: [400, `Upload at most ${BULK_PHOTO_MAX_FILES} photos at a time`],
  LIMIT_UNEXPECTED_FILE: [400, `Attach the photos as "images" (at most ${BULK_PHOTO_MAX_FILES})`],
  LIMIT_PART_COUNT: [400, 'Too many parts in the upload'],
  LIMIT_FIELD_COUNT: [400, 'Too many fields in the upload'],
};

// Size check before reading the body, then multer with its errors made readable
export function bulkPhotoUpload(req: Request, res: Response, next: NextFunction) {
  const length = Number(req.headers['content-length'] || 0);
  if (length > BULK_PHOTO_MAX_REQUEST_BYTES) {
    return next(new AppError(`One upload may be at most ${BULK_PHOTO_MAX_REQUEST_BYTES / 1024 / 1024} MB; send fewer photos per batch`, 413));
  }
  upload(req, res, (err?: unknown) => {
    if (err instanceof multer.MulterError) {
      const [status, message] = MULTER_MESSAGES[err.code] ?? [400, 'The upload could not be read'];
      return next(new AppError(message, status));
    }
    next(err as Error | undefined);
  });
}

// Upload batches per admin address: generous for a catalogue load, but bounded
export const bulkPhotoLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.PHOTO_BULK_RATE_LIMIT_MAX || '60'),
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many photo uploads. Please try again later.', error: 'Too many photo uploads. Please try again later.' },
});

// POST /products/images/bulk — per-file results; one bad file never fails the batch
export async function postBulkProductImages(req: Request, res: Response, next: NextFunction) {
  try {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    const data = await bulkSetProductImages(files, req.user!.id);
    res.json({ success: true, message: `${data.summary.uploaded} of ${data.summary.total} photos saved; a pharmacist reviews them before customers see them`, data });
  } catch (err) { next(err); }
}
