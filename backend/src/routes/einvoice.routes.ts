import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { getEinvoices, postRetryEinvoice } from '../controllers/einvoice.controller';

// E-invoices — /api/v1/einvoices (accounts and admins; packers see the gate at dispatch)
const router = Router();
router.use(authenticate, authorize('admin', 'super_admin'));
router.get('/', getEinvoices);
router.post('/:id/retry', postRetryEinvoice);
export default router;
