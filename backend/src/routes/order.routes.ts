import { Router } from 'express';
import { createOrder, getMyOrders, getOrder, updateOrderStatus, getOrderQueue } from '../controllers/order.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { settleCreditOrder } from '../controllers/credit.controller';

const router = Router();

router.post('/', authenticate, authorize('customer', 'doctor', 'pharmacy'), createOrder);
router.get('/my', authenticate, getMyOrders);
router.get('/queue', authenticate, authorize('pharmacist_rx', 'pharmacist_pack', 'delivery', 'admin', 'super_admin'), getOrderQueue);
router.get('/:id', authenticate, getOrder);
router.patch('/:id/status', authenticate, authorize('pharmacist_rx', 'pharmacist_pack', 'delivery', 'admin', 'super_admin'), updateOrderStatus);

router.post('/:id/settle-credit', authenticate, authorize('admin', 'super_admin'), settleCreditOrder);

export default router;
