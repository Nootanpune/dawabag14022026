import { Router } from 'express';
import { createPaymentOrder, verifyPayment, handleWebhook, initiateRefund } from '../controllers/payment.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = Router();

router.post('/create-order', authenticate, createPaymentOrder);
router.post('/verify', authenticate, verifyPayment);
router.post('/webhook', handleWebhook);
router.post('/refund', authenticate, authorize('admin', 'super_admin'), initiateRefund);

export default router;
