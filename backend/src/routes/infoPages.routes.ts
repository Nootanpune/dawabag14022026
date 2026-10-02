import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { getInfoPageByKey, getInfoPageHistory, getInfoPages, postInfoPage } from '../controllers/infoPages.controller';

// Trust pages — /api/v1/info-pages (Sprint 33): public read; admins publish a new version (C-46)
const router = Router();
router.get('/', getInfoPages);
router.get('/:key', getInfoPageByKey);
router.get('/:key/history', authenticate, authorize('admin', 'super_admin'), getInfoPageHistory);
router.post('/:key', authenticate, authorize('admin', 'super_admin'), postInfoPage);

export default router;
