import { Router } from 'express';
import { authenticate, optionalAuth } from '../middleware/auth.middleware';
import {
  getCreditNoteLink, getCreditNotePdf, getShipmentInvoice, getShipmentInvoiceLink,
} from '../controllers/invoice.controller';

// Tax invoices and credit notes — /api/v1/invoices/*
const router = Router();
router.get('/shipments/:shipmentId.pdf', optionalAuth, getShipmentInvoice);        // session or signed link
router.get('/shipments/:shipmentId/link', authenticate, getShipmentInvoiceLink);
router.get('/credit-notes/:creditNoteId.pdf', optionalAuth, getCreditNotePdf);
router.get('/credit-notes/:creditNoteId/link', authenticate, getCreditNoteLink);
export default router;
