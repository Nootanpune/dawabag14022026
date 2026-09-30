// src/controllers/invoice.controller.ts — tax invoices and credit notes as PDF
// Rendered from the database on each request (C-13, C-30); nothing is stored.
// Access: the buyer, staff, the partner that shipped it, or a signed link
// issued to one of them (valid 5 minutes).
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { queryOne } from '../config/database';
import { AppError } from '../utils/AppError';
import { signPath, verifySignedPath } from '../utils/signedLink';
import { InvoiceData, loadCreditNote, loadInvoice } from '../services/invoiceData.service';
import { renderInvoicePdf } from '../services/invoicePdf';

const STAFF = ['admin', 'super_admin', 'pharmacist_rx', 'pharmacist_pack', 'delivery'];
const uuid = z.string().uuid();

async function canSee(req: Request, shipmentId: string): Promise<boolean> {
  const u = req.user;
  if (!u) return false;
  const s = await queryOne<{ user_id: string; partner_id: string | null }>(
    `SELECT o.user_id, s.partner_id FROM order_shipments s JOIN orders o ON o.id = s.order_id WHERE s.id = $1`, [shipmentId]);
  if (!s) return false;
  if (s.user_id === u.id || STAFF.includes(u.role)) return true;
  if (u.role === 'partner' && s.partner_id) {
    return !!(await queryOne('SELECT 1 FROM vendor_users WHERE user_id = $1 AND vendor_id = $2', [u.id, s.partner_id]));
  }
  return false;
}

async function sendPdf(res: Response, data: InvoiceData) {
  const pdf = await renderInvoicePdf(data);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${data.invoiceNumber.replace(/\//g, '-')}.pdf"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(pdf);
}

const signedOk = (req: Request) => verifySignedPath(req.baseUrl + req.path, req.query.exp, req.query.sig);

// GET /invoices/shipments/:shipmentId.pdf
export async function getShipmentInvoice(req: Request, res: Response, next: NextFunction) {
  try {
    const shipmentId = uuid.parse(req.params.shipmentId);
    if (!signedOk(req) && !(await canSee(req, shipmentId))) throw new AppError('Invoice not found', 404);
    await sendPdf(res, await loadInvoice(shipmentId));
  } catch (err) { next(err); }
}

// GET /invoices/credit-notes/:creditNoteId.pdf
export async function getCreditNotePdf(req: Request, res: Response, next: NextFunction) {
  try {
    const id = uuid.parse(req.params.creditNoteId);
    const cn = await queryOne<{ shipment_id: string }>('SELECT shipment_id FROM credit_notes WHERE id = $1', [id]);
    if (!cn || (!signedOk(req) && !(await canSee(req, cn.shipment_id)))) throw new AppError('Credit note not found', 404);
    await sendPdf(res, await loadCreditNote(id));
  } catch (err) { next(err); }
}

// GET /invoices/shipments/:shipmentId/link and /invoices/credit-notes/:id/link → { url }
export async function getShipmentInvoiceLink(req: Request, res: Response, next: NextFunction) {
  try {
    const shipmentId = uuid.parse(req.params.shipmentId);
    if (!(await canSee(req, shipmentId))) throw new AppError('Invoice not found', 404);
    res.json({ success: true, data: { url: signPath(`${req.baseUrl}/shipments/${shipmentId}.pdf`), expires_in: 300 } });
  } catch (err) { next(err); }
}

export async function getCreditNoteLink(req: Request, res: Response, next: NextFunction) {
  try {
    const id = uuid.parse(req.params.creditNoteId);
    const cn = await queryOne<{ shipment_id: string }>('SELECT shipment_id FROM credit_notes WHERE id = $1', [id]);
    if (!cn || !(await canSee(req, cn.shipment_id))) throw new AppError('Credit note not found', 404);
    res.json({ success: true, data: { url: signPath(`${req.baseUrl}/credit-notes/${id}.pdf`), expires_in: 300 } });
  } catch (err) { next(err); }
}
