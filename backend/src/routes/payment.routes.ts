import { Router } from 'express';
import { createPaymentOrder, verifyPayment, handleWebhook, initiateRefund } from '../controllers/payment.controller';
import { getPaymentOptions, postDemoOrderPayment } from '../controllers/paymentOptions.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = Router();

router.get('/options', authenticate, getPaymentOptions);
router.post('/create-order', authenticate, createPaymentOrder);
// Trial only, without Razorpay keys (payments/paymentMode.ts): 404 everywhere else
router.post('/demo', authenticate, postDemoOrderPayment);
router.post('/verify', authenticate, verifyPayment);
router.post('/webhook', handleWebhook);
router.post('/refund', authenticate, authorize('admin', 'super_admin'), initiateRefund);

export default router;
