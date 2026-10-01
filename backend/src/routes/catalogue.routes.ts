import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { catalogueUpload, getTemplate, postCommit, postPreview } from '../controllers/catalogueImport.controller';

// Catalogue and opening-stock import — /api/v1/catalogue/* (admin)
const router = Router();
router.use(authenticate, authorize('admin', 'super_admin'));
router.get('/template', getTemplate);
router.post('/import/preview', catalogueUpload, postPreview);
router.post('/import/commit', catalogueUpload, postCommit);
export default router;
