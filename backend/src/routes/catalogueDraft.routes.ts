// /api/v1/catalogue-drafts — Sprint 29 "New products to complete".
// Pharmacists and admins see the queue, save details and close a draft as "not a
// medicine we list"; only a pharmacist (pharmacist_rx) approves, exactly as for any
// product copy under C-19 (routes/product.routes.ts content-review).
import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import {
  getDraftOptions, getDrafts, getOneDraft, patchDraft, postApproveDraft, postBulkSet, postRejectDraft,
} from '../controllers/catalogueDraft.controller';

const router = Router();
const staff = authorize('pharmacist_rx', 'admin', 'super_admin');

router.use(authenticate);
router.get('/', staff, getDrafts);
router.get('/options', staff, getDraftOptions);
router.post('/bulk', staff, postBulkSet);
router.get('/:productId', staff, getOneDraft);
router.patch('/:productId', staff, patchDraft);
router.post('/:productId/approve', authorize('pharmacist_rx'), postApproveDraft);   // C-19
router.post('/:productId/reject', staff, postRejectDraft);

export default router;
