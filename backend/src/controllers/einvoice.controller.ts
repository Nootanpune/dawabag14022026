// src/controllers/einvoice.controller.ts
import { Request, Response, NextFunction } from 'express';
import { EInvoiceService } from '../services/einvoice.service';
import { AppError } from '../utils/AppError';

// Generate IRN when order is packed
export const generateIRN = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { orderId } = req.params;
    const result = await EInvoiceService.generateIRN(orderId);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

// Get e-invoice status for an order
export const getEInvoiceStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { orderId } = req.params;
    const invoices = await require('../config/database').pool.query(
      'SELECT irn, ack_no, ack_dt, irn_status, qr_code, invoice_pdf_s3_key FROM e_invoices WHERE order_id = $1',
      [orderId]
    );
    if (!invoices.rows.length) {
      return res.json({ success: true, data: { status: 'not_generated' } });
    }
    res.json({ success: true, data: invoices.rows[0] });
  } catch (err) { next(err); }
};

// Cancel IRN (within 24 hours only)
export const cancelIRN = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { orderId } = req.params;
    const { reason } = req.body;
    if (![1,2,3,4].includes(Number(reason))) {
      throw new AppError('reason must be 1 (Duplicate), 2 (Data Error), 3 (Order Cancelled), or 4 (Other)', 400);
    }
    await EInvoiceService.cancelIRN(orderId, Number(reason) as 1|2|3|4);
    res.json({ success: true, data: { message: 'IRN cancelled successfully on IRP portal' } });
  } catch (err) { next(err); }
};

// Get all pending/failed IRNs (admin exception queue)
export const getPendingEInvoices = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pending = await EInvoiceService.getPendingEInvoices();
    res.json({ success: true, data: { count: pending.length, invoices: pending } });
  } catch (err) { next(err); }
};

// Retry IRN generation for failed invoice (admin action)
export const retryIRN = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { orderId } = req.params;
    const result = await EInvoiceService.generateIRN(orderId);
    res.json({ success: true, data: { message: 'IRN retry successful', ...result } });
  } catch (err) { next(err); }
};

// ── Routes ────────────────────────────────────────────────────────────────────
import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = Router();
router.use(authenticate);

// Order-level e-invoice actions (staff + admin)
router.post('/generate/:orderId',
  authorize('admin','super_admin','pharmacist_pack'),
  generateIRN);
router.get('/status/:orderId',
  authorize('admin','super_admin','pharmacist_rx','pharmacist_pack'),
  getEInvoiceStatus);
router.post('/cancel/:orderId',
  authorize('admin','super_admin'),
  cancelIRN);

// Admin exception management
router.get('/pending',
  authorize('admin','super_admin'),
  getPendingEInvoices);
router.post('/retry/:orderId',
  authorize('admin','super_admin'),
  retryIRN);

export default router;
