import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import {
  getAllRefunds, getAllReturns, getMyRefunds, getMyReturns, getOneReturn, postCloseReturn, postDecideReturn,
  postRefundProcessed, postReturn,
} from '../controllers/aftercare.controller';

// Returns and refunds — /api/v1/returns/* (C-37)
const router = Router();
router.use(authenticate);

const staff = authorize('admin', 'super_admin', 'pharmacist_rx', 'pharmacist_pack');
const accounts = authorize('admin', 'super_admin');

router.get('/', getMyReturns);
router.post('/', postReturn);
router.get('/refunds/my', getMyRefunds);
router.get('/refunds/admin', accounts, getAllRefunds);
router.post('/refunds/admin/:id/processed', accounts, postRefundProcessed);
router.get('/admin/all', staff, getAllReturns);
router.post('/:id/decide', authorize('admin', 'super_admin', 'pharmacist_rx'), postDecideReturn);
router.post('/:id/close', staff, postCloseReturn);
router.get('/:id', getOneReturn);

export default router;
