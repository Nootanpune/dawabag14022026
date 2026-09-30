import { Router } from 'express';
import { createOrder, getMyOrders, getOrderDetail, updateOrderStatus, getOrderQueue } from '../controllers/order.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = Router();

router.post('/', authenticate, authorize('customer', 'doctor', 'pharmacy'), createOrder);
router.get('/my', authenticate, getMyOrders);
router.get('/queue', authenticate, authorize('pharmacist_rx', 'pharmacist_pack', 'delivery', 'admin', 'super_admin'), getOrderQueue);
router.get('/:orderId', authenticate, getOrderDetail);
router.patch('/:orderId/status', authenticate, authorize('pharmacist_rx', 'pharmacist_pack', 'delivery', 'admin', 'super_admin'), updateOrderStatus);

export default router;
