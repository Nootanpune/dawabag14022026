import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { getOneRecall, getRecalls, postRecall } from '../controllers/recall.controller';

// Batch recalls — /api/v1/recalls/* (C-28)
const router = Router();
router.use(authenticate, authorize('admin', 'super_admin'));

router.get('/', getRecalls);
router.post('/', postRecall);
router.get('/:id', getOneRecall);

export default router;
