// src/controllers/invoice.controller.ts — GET a shipment's tax invoice as PDF
// Rendered from the database on each request (C-13, C-30); nothing is stored.
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { queryOne } from '../config/database';
import { AppError } from '../utils/AppError';
import { loadInvoice } from '../services/invoiceData.service';
import { renderInvoicePdf } from '../services/invoicePdf';

const STAFF = ['admin', 'super_admin', 'pharmacist_rx', 'pharmacist_pack'];

// GET /invoices/shipments/:shipmentId.pdf — buyer, staff, or the partner that shipped it
export async function getShipmentInvoice(req: Request, res: Response, next: NextFunction) {
  try {
    const shipmentId = z.string().uuid().parse(req.params.shipmentId);
    const s = await queryOne<{ user_id: string; partner_id: string | null }>(
      `SELECT o.user_id, s.partner_id FROM order_shipments s JOIN orders o ON o.id = s.order_id WHERE s.id = $1`, [shipmentId]);
    if (!s) throw new AppError('Invoice not found', 404);

    const u = req.user!;
    let allowed = s.user_id === u.id || STAFF.includes(u.role);
    if (!allowed && u.role === 'partner' && s.partner_id) {
      allowed = !!(await queryOne('SELECT 1 FROM vendor_users WHERE user_id = $1 AND vendor_id = $2', [u.id, s.partner_id]));
    }
    if (!allowed) throw new AppError('Invoice not found', 404);

    const data = await loadInvoice(shipmentId);
    const pdf = await renderInvoicePdf(data);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${data.invoiceNumber.replace(/\//g, '-')}.pdf"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(pdf);
  } catch (err) { next(err); }
}
