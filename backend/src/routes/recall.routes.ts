import { Router } from 'express';
import multer from 'multer';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { getOneRecall, getRecalls, postRecall } from '../controllers/recall.controller';
import {
  getAlerts, getOneAlert, postAlert, postAlertImport, postClearLineProduct, postClearMatch, postRecallMatch,
} from '../controllers/recallAlert.controller';

// Batch recalls and regulator alerts — /api/v1/recalls/* (C-28)
const router = Router();
router.use(authenticate, authorize('admin', 'super_admin'));
// Alert lists are read in memory, never stored on disk
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

router.get('/alerts', getAlerts);
router.post('/alerts', postAlert);
router.post('/alerts/import', upload.single('file'), postAlertImport);
router.get('/alerts/:id', getOneAlert);
router.post('/alerts/matches/:id/recall', postRecallMatch);
router.post('/alerts/matches/:id/clear', postClearMatch);
router.post('/alerts/lines/:id/clear', postClearLineProduct);

router.get('/', getRecalls);
router.post('/', postRecall);
router.get('/:id', getOneRecall);

export default router;
