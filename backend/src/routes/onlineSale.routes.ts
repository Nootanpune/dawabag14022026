// Sprint 39: online-sale status per product (handover D4 / D5; C-10, C-46).
// Pharmacists allow (permitted, with a dated reference); pharmacists and admins stop.
import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { getOnlineStatusList, getProductOnlineStatusLog, postBulkOnlineStatus, putProductOnlineStatus } from '../controllers/onlineSale.controller';

const router = Router();
router.use(authenticate, authorize('pharmacist_rx', 'admin', 'super_admin'));

router.get('/products', getOnlineStatusList);
router.put('/products/:productId', putProductOnlineStatus);
router.post('/products/bulk', postBulkOnlineStatus);
router.get('/products/:productId/log', getProductOnlineStatusLog);

export default router;
