import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { getLegalInfo } from '../controllers/grievance.controller';
import { getOnePolicy, getPolicies, getPolicyHistory, postPolicy, postTranslation } from '../controllers/policy.controller';

// Public legal details and policies — /api/v1/legal/* (C-04, C-36, C-39)
const router = Router();
router.get('/info', getLegalInfo);
router.get('/policies', getPolicies);
router.get('/policies/:key', getOnePolicy);
router.get('/policies/:key/history', getPolicyHistory);
router.post('/policies', authenticate, authorize('admin', 'super_admin'), postPolicy);
router.post('/policies/:key/translations', authenticate, authorize('admin', 'super_admin'), postTranslation);

export default router;
