// Sprint 40: self-inspection register — /api/v1/self-inspections/* (O15, C-34).
// Staff read; a pharmacist or admin records an inspection; admins keep the checklists;
// a corrective action's owner or an admin moves it on.
import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import {
  getActionOwners, getActions, getInspections, getOneInspection, getTemplates, postActionStatus, postInspection, postTemplate, putTemplate,
} from '../controllers/selfInspection.controller';

const STAFF = ['admin', 'super_admin', 'pharmacist_rx', 'pharmacist_pack'] as const;
const router = Router();
router.use(authenticate, authorize(...STAFF));

router.get('/templates', getTemplates);
router.post('/templates', authorize('admin', 'super_admin'), postTemplate);
router.put('/templates/:id', authorize('admin', 'super_admin'), putTemplate);
router.get('/people', getActionOwners);
router.get('/actions', getActions);
router.post('/actions/:id/status', postActionStatus);
router.get('/', getInspections);
router.post('/', authorize('pharmacist_rx', 'admin', 'super_admin'), postInspection);
router.get('/:id', getOneInspection);

export default router;
