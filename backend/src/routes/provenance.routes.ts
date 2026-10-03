// Sprint 39: partner batch provenance, disclosed to Dawabag's admin (C-02, C-05, C-28)
import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { getProvenance } from '../controllers/provenance.controller';

const router = Router();
router.get('/', authenticate, authorize('admin', 'super_admin'), getProvenance);

export default router;
