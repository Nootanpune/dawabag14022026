// /api/v1/partner-feed/:partnerId/* — Sprint 36: machine access for a partner's
// billing software with a per-partner API key (scope "stock_upload"). No cookie or
// sign-in: the key in "Authorization: Bearer" is the only credential. Order matters:
// the key is checked and an hourly upload slot taken BEFORE the file is read.
import { Router } from 'express';
import { requirePartnerKey, stockFeedRateLimit } from '../middleware/partnerApiKey.middleware';
import { stockFileUpload } from '../controllers/partnerStockImport.controller';
import { getFeedWhoami, postFeedStockFile } from '../controllers/partnerFeed.controller';

const router = Router({ mergeParams: true });
const key = requirePartnerKey('stock_upload');

router.get('/:partnerId/whoami', key, getFeedWhoami);
router.post('/:partnerId/stock-files', key, stockFeedRateLimit, stockFileUpload, postFeedStockFile);

export default router;
