// Sprint 40: Good Distribution Practice records per batch — /api/v1/gdp/* (C-25, C-28, C-34).
// Store staff record events on Dawabag's batches and see the excursion queue; only a
// Dawabag pharmacist with a valid registration decides an excursion (service checks).
import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import {
  getGdpBatchLog, getGdpBatches, getPendingExcursions, postOwnGdpRecord, postStaffDisposition,
} from '../controllers/gdp.controller';

const STORE = ['admin', 'super_admin', 'pharmacist_pack', 'pharmacist_rx'] as const;
const router = Router();
router.use(authenticate);

router.get('/batches', authorize(...STORE), getGdpBatches);
router.get('/batches/:kind/:id', authorize(...STORE), getGdpBatchLog);
router.post('/batches/own/:id/records', authorize(...STORE), postOwnGdpRecord);
router.get('/excursions/pending', authorize(...STORE), getPendingExcursions);
router.post('/excursions/:id/disposition', authorize(...STORE), postStaffDisposition);   // pharmacist_rx only: the service says so plainly

export default router;
