import { Router } from 'express';
import { authenticate, authorize, optionalAuth } from '../middleware/auth.middleware';
import {
  getMedicineInfo, getMedicineInfoEditor, getMedicineInfoQueue, getMedicineInfoReturned, postMedicineInfoReview, postMedicineInfoSubmit, putMedicineInfoDraft,
} from '../controllers/medicineInfo.controller';
import { getDeliveryEstimate, getSubstitutes } from '../controllers/productPage.controller';
import {
  draftsFileUpload, getImportedDraftCounts, getImportedDrafts, getInfoDraftsTemplate, getInfoImportPartners, postInfoDraftsImport,
} from '../controllers/medicineInfoImport.controller';

// Product page information — /api/v1/medicines/* (Sprint 33)
const router = Router();
const writers = authorize('pharmacist_rx', 'admin', 'super_admin');

// Staff: the C-19 review queue for medicine information
router.get('/info-review/queue', authenticate, writers, getMedicineInfoQueue);
// Sprint 36: what a second pharmacist rejected, back to the person who wrote it
router.get('/info-review/returned', authenticate, writers, getMedicineInfoReturned);

// Sprint 45: drafts written outside Dawabag for one partner's products — imported as DRAFTS only;
// a registered pharmacist checks and sends, a second one approves (C-19); each import audited (C-46)
router.get('/info-imports/template', authenticate, writers, getInfoDraftsTemplate);
router.get('/info-imports/partners', authenticate, writers, getInfoImportPartners);
router.get('/info-imports/drafts', authenticate, writers, getImportedDrafts);
router.get('/info-imports/counts', authenticate, writers, getImportedDraftCounts);
router.post('/info-imports', authenticate, writers, draftsFileUpload, postInfoDraftsImport);

// Buyers (public; the price and Rx rule follow the signed-in buyer's type)
router.get('/:productId/info', getMedicineInfo);
router.get('/:productId/substitutes', optionalAuth, getSubstitutes);
router.get('/:productId/delivery', optionalAuth, getDeliveryEstimate);

// Staff editor: write a draft, send it for review; ANOTHER pharmacist approves (four eyes, Sprint 36; C-17, C-19, C-46)
router.get('/:productId/info/editor', authenticate, writers, getMedicineInfoEditor);
router.put('/:productId/info/draft', authenticate, writers, putMedicineInfoDraft);
router.post('/:productId/info/submit', authenticate, writers, postMedicineInfoSubmit);
router.post('/:productId/info/review', authenticate, authorize('pharmacist_rx'), postMedicineInfoReview);

export default router;
