import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { getShipmentInvoice } from '../controllers/invoice.controller';

// Tax invoices — /api/v1/invoices/*
const router = Router();
router.get('/shipments/:shipmentId.pdf', authenticate, getShipmentInvoice);
export default router;
