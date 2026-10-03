// Sprint 40: mock recall drills — /api/v1/recall-drills/* (O15, C-28). Admins only.
import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { getDrillBatches, getDrillReport, getDrills, getOneDrill, postCloseDrill, postDrill } from '../controllers/recallDrill.controller';

const router = Router();
router.use(authenticate, authorize('admin', 'super_admin'));

router.get('/', getDrills);
router.post('/', postDrill);
router.get('/batches', getDrillBatches);
router.get('/:id', getOneDrill);
router.get('/:id/report.pdf', getDrillReport);
router.post('/:id/close', postCloseDrill);

export default router;
