import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import {
  getAdjustments, getBatches, getCounts, getDestructionRegister, getOneCount, postAdjustment, postApproveCount, postCount,
  postDecideAdjustment, postDisposal, postSubmitCount, putCountLines,
} from '../controllers/stockControl.controller';

// Stock control — /api/v1/stock/*. Approvals are by admins and never by the requester.
const router = Router();
router.use(authenticate);
const store = authorize('admin', 'super_admin', 'pharmacist_pack', 'pharmacist_rx');
const admin = authorize('admin', 'super_admin');

router.get('/batches', store, getBatches);
router.get('/adjustments', store, getAdjustments);
router.post('/adjustments', store, postAdjustment);
router.post('/adjustments/:id/decide', admin, postDecideAdjustment);
router.post('/adjustments/:id/disposal', store, postDisposal);
router.get('/destruction-register', store, getDestructionRegister);
router.get('/counts', store, getCounts);
router.post('/counts', store, postCount);
router.get('/counts/:id', store, getOneCount);
router.put('/counts/:id/lines', store, putCountLines);
router.post('/counts/:id/submit', store, postSubmitCount);
router.post('/counts/:id/approve', admin, postApproveCount);
export default router;
