// /api/v1/partner-feed/:partnerId/* — Sprint 36: machine access for a partner's
// billing software with a per-partner API key (scope "stock_upload"). No cookie or
// sign-in: the key in "Authorization: Bearer" is the only credential. Order matters:
// the key is checked and an hourly upload slot taken BEFORE the file is read.
import { Router } from 'express';
import { requirePartnerKey, stockFeedRateLimit, stockSnapshotRateLimit } from '../middleware/partnerApiKey.middleware';
import { stockFileUpload } from '../controllers/partnerStockImport.controller';
import { getFeedWhoami, liveFileIfLive, postFeedSnapshot, postFeedStockFile } from '../controllers/partnerFeed.controller';
import { Request, Response, NextFunction } from 'express';

/** Sprint 37: a snapshot is JSON (parsed by the app), or the stock file as multipart (read in memory, never on disk). */
const snapshotBody = (req: Request, res: Response, next: NextFunction) => (req.is('multipart/form-data') ? stockFileUpload(req, res, next) : next());

const router = Router({ mergeParams: true });
const key = requirePartnerKey('stock_upload');

router.get('/:partnerId/whoami', key, getFeedWhoami);
// Sprint 37: for a partner in live mode the file is a full snapshot (liveFileIfLive), otherwise a draft as before
router.post('/:partnerId/stock-files', key, stockFeedRateLimit, stockFileUpload, liveFileIfLive, postFeedStockFile);
// Sprint 37: live mode — a full snapshot every 1–5 minutes; quantities apply automatically
router.post('/:partnerId/stock-snapshot', key, stockSnapshotRateLimit, snapshotBody, postFeedSnapshot);

export default router;
