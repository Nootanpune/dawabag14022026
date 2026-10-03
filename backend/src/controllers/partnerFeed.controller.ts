// src/controllers/partnerFeed.controller.ts — Sprint 36: the partner's billing
// software pushes its stock file with an API key. Exactly the manual upload's
// pipeline (createImport: read in memory, columns from the partner's saved choice
// or the software's preset, lines matched and checked) — the file is never written
// to disk (standing rule). The result is a DRAFT import: the partner reviews and
// applies it in the portal, where a person makes the declarations (cold chain,
// Schedule H1, catalogue price) — see docs/partner-stock-api.md.
import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError';
import { createImport, DRAFT_VALID_HOURS } from '../services/partnerStockImport/import.service';
import { recordKeyUse } from '../services/partnerApiKeys/keys.service';
import { maskedKey } from '../services/partnerApiKeys/keys';
import { clientIp } from '../middleware/partnerApiKey.middleware';

// GET /partner-feed/:partnerId/whoami — lets the software's installer test its key
export async function getFeedWhoami(req: Request, res: Response, next: NextFunction) {
  try {
    const k = req.partnerKey!;
    await recordKeyUse(k, clientIp(req), { action: 'whoami' });
    res.json({ success: true, data: { partner_id: k.partnerId, partner_name: k.partnerName, key: maskedKey(k.prefix), scope: k.scope } });
  } catch (e) { next(e); }
}

// POST /partner-feed/:partnerId/stock-files (multipart "file")
export async function postFeedStockFile(req: Request, res: Response, next: NextFunction) {
  try {
    const k = req.partnerKey!;
    if (!req.file?.buffer) throw new AppError('Attach the stock file as the multipart field "file"', 422);
    const made = await createImport(k.partnerId, { userId: null, apiKey: { id: k.keyId, prefix: k.prefix } },
      { buffer: req.file.buffer, originalname: req.file.originalname, size: req.file.size });
    await recordKeyUse(k, clientIp(req), { action: 'stock_file_uploaded', import_id: made.id });
    res.status(201).json({ success: true, data: {
      import_id: made.id,
      status: 'draft',
      summary: made.summary,
      next_step: `Waiting in the Dawabag partner portal (Stock import) for the partner to review and apply within ${DRAFT_VALID_HOURS} hours`,
    } });
  } catch (e) { next(e); }
}
