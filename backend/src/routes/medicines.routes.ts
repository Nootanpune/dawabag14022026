import { Router } from 'express';
import { authenticate, authorize, optionalAuth } from '../middleware/auth.middleware';
import {
  getMedicineInfo, getMedicineInfoEditor, getMedicineInfoQueue, postMedicineInfoReview, postMedicineInfoSubmit, putMedicineInfoDraft,
} from '../controllers/medicineInfo.controller';
import { getDeliveryEstimate, getSubstitutes } from '../controllers/productPage.controller';

// Product page information — /api/v1/medicines/* (Sprint 33)
const router = Router();
const writers = authorize('pharmacist_rx', 'admin', 'super_admin');

// Staff: the C-19 review queue for medicine information
router.get('/info-review/queue', authenticate, writers, getMedicineInfoQueue);

// Buyers (public; the price and Rx rule follow the signed-in buyer's type)
router.get('/:productId/info', getMedicineInfo);
router.get('/:productId/substitutes', optionalAuth, getSubstitutes);
router.get('/:productId/delivery', optionalAuth, getDeliveryEstimate);

// Staff editor: write a draft, send it for review; a pharmacist approves (C-17, C-19, C-46)
router.get('/:productId/info/editor', authenticate, writers, getMedicineInfoEditor);
router.put('/:productId/info/draft', authenticate, writers, putMedicineInfoDraft);
router.post('/:productId/info/submit', authenticate, writers, postMedicineInfoSubmit);
router.post('/:productId/info/review', authenticate, authorize('pharmacist_rx'), postMedicineInfoReview);

export default router;
