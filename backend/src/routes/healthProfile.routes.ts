import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import {
  deleteMember, deleteProfile, getOrderHealthNote, getProfile, postMember, putMember, putProfile,
} from '../controllers/healthProfile.controller';

// Health profile — /api/v1/health-profile (Sprint 33): consent first (C-41), deletable (C-43, C-44);
// pharmacists read it for the order they are checking (C-08), each look audited (C-46)
const router = Router();
router.use(authenticate);
router.get('/orders/:orderId', authorize('pharmacist_rx', 'pharmacist_pack'), getOrderHealthNote);
router.get('/', getProfile);
router.put('/', putProfile);
router.delete('/', deleteProfile);
router.post('/members', postMember);
router.put('/members/:memberId', putMember);
router.delete('/members/:memberId', deleteMember);

export default router;
