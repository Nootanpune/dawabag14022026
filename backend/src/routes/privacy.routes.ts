import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import {
  getDataRequests, getMyConsents, getMyDataExport, patchDataRequest, postDataRequest, putMarketingConsent,
} from '../controllers/privacy.controller';

// Privacy rights — /api/v1/privacy/* (C-40..C-44)
const router = Router();
router.use(authenticate);

const admin = authorize('admin', 'super_admin');

router.get('/consents', getMyConsents);
router.put('/consents/marketing', putMarketingConsent);
router.get('/export', getMyDataExport);
router.post('/requests', postDataRequest);
router.get('/admin/requests', admin, getDataRequests);
router.patch('/admin/requests/:id', admin, patchDataRequest);

export default router;
