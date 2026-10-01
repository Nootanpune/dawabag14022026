// src/controllers/purchasing.controller.ts — suppliers, purchase orders, goods receipts
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query } from '../config/database';
import { writeAudit } from '../utils/audit';
import { AppError } from '../utils/AppError';
import {
  approvePurchaseOrder, cancelPurchaseOrder, closePurchaseOrder, createPurchaseOrder, getPurchaseOrder, listPurchaseOrders,
} from '../services/purchasing/purchaseOrder.service';
import { getGoodsReceipt, listGoodsReceipts, receiveGoods } from '../services/purchasing/goodsReceipt.service';
import { todayIST } from '../utils/ist';

const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const paise = z.number().int().min(0).max(100_000_000);
const reason = z.object({ reason: z.string().trim().min(3).max(500) });

// Suppliers are vendors of type 'supplier'; they become usable after the existing approval (POST /vendors/:id/approve)
export async function postSupplier(req: Request, res: Response, next: NextFunction) {
  try {
    const d = z.object({
      name: z.string().trim().min(2).max(200), drug_license_no: z.string().trim().min(3).max(100),
      gst_number: z.string().regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/, 'Enter a valid GSTIN'),
      state: z.string().trim().min(2).max(100), city: z.string().trim().max(100).optional(),
      contact_name: z.string().trim().max(100).optional(), contact_mobile: z.string().regex(/^[6-9]\d{9}$/).optional(),
      contact_email: z.string().email().optional(),
    }).parse(req.body);
    const rows = await query(
      `INSERT INTO vendors (name, drug_license_no, gst_number, state, city, contact_name, contact_mobile, contact_email, vendor_type, approval_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'supplier','pending') RETURNING id, name, approval_status`,
      [d.name, d.drug_license_no, d.gst_number, d.state, d.city ?? null, d.contact_name ?? null, d.contact_mobile ?? null, d.contact_email ?? null]);
    await writeAudit({ userId: null, action: 'supplier_added', performedBy: req.user!.id, newValue: { vendor_id: (rows[0] as any).id, name: d.name } });
    res.status(201).json({ success: true, data: rows[0] });
  } catch (e) { next(e); }
}

export async function getSuppliers(_req: Request, res: Response, next: NextFunction) {
  try {
    const rows = await query(
      `SELECT id, name, drug_license_no, drug_license_expiry, gst_number, state, approval_status, is_active,
              (drug_license_expiry IS NOT NULL AND drug_license_expiry >= CURRENT_DATE AND approval_status = 'approved' AND is_active) AS can_supply
       FROM vendors WHERE vendor_type IN ('supplier', 'both') ORDER BY name`);
    res.json({ success: true, data: { suppliers: rows } });
  } catch (e) { next(e); }
}

export async function postPurchaseOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const d = z.object({
      vendor_id: uuid, expected_by: date.optional(), notes: z.string().max(1000).optional(),
      items: z.array(z.object({ product_id: uuid, quantity: z.number().int().min(1).max(1_000_000), unit_cost_paise: paise }))
        .min(1).max(200).refine((a) => new Set(a.map((i) => i.product_id)).size === a.length, 'Each product once'),
    }).parse(req.body);
    res.status(201).json({ success: true, data: await createPurchaseOrder(req.user!.id, d) });
  } catch (e) { next(e); }
}

export async function getPurchaseOrders(req: Request, res: Response, next: NextFunction) {
  try {
    const status = z.enum(['draft', 'sent', 'partially_received', 'received', 'closed', 'cancelled']).optional().parse(req.query.status);
    res.json({ success: true, data: { purchase_orders: await listPurchaseOrders(status) } });
  } catch (e) { next(e); }
}
export async function getOnePurchaseOrder(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await getPurchaseOrder(uuid.parse(req.params.id)) }); } catch (e) { next(e); }
}
export async function postApprovePo(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await approvePurchaseOrder(req.user!.id, uuid.parse(req.params.id)) }); } catch (e) { next(e); }
}
export async function postCancelPo(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await cancelPurchaseOrder(req.user!.id, uuid.parse(req.params.id), reason.parse(req.body).reason) }); } catch (e) { next(e); }
}
export async function postClosePo(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await closePurchaseOrder(req.user!.id, uuid.parse(req.params.id), reason.parse(req.body).reason) }); } catch (e) { next(e); }
}

export async function postGoodsReceipt(req: Request, res: Response, next: NextFunction) {
  try {
    const d = z.object({
      vendor_id: uuid, po_id: uuid.optional(), supplier_invoice_no: z.string().trim().min(1).max(60),
      supplier_invoice_date: date, notes: z.string().max(1000).optional(),
      lines: z.array(z.object({
        po_item_id: uuid.optional(), product_id: uuid, batch_number: z.string().trim().min(1).max(100),
        expiry_date: date, manufactured_date: date.optional(), quantity: z.number().int().min(1).max(1_000_000),
        free_quantity: z.number().int().min(0).max(1_000_000).optional(), unit_cost_paise: paise, printed_mrp_paise: paise.refine((v) => v > 0, 'MRP is required'),
      })).min(1).max(300),
    }).parse(req.body);
    if (d.supplier_invoice_date > todayIST()) throw new AppError('Supplier invoice date is in the future', 400);
    res.status(201).json({ success: true, data: await receiveGoods(req.user!.id, req.user!.role, d) });
  } catch (e) { next(e); }
}
export async function getGoodsReceipts(req: Request, res: Response, next: NextFunction) {
  try {
    const f = z.object({
      from: date.optional(), to: date.optional(), vendor_id: z.string().uuid().optional(), q: z.string().trim().min(1).max(60).optional(),
      page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(200).default(50),
    }).parse(req.query);
    if (f.from && f.to && f.from > f.to) throw new AppError('from must be on or before to', 400);
    res.json({ success: true, data: await listGoodsReceipts(f) });
  } catch (e) { next(e); }
}
export async function getOneGoodsReceipt(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await getGoodsReceipt(uuid.parse(req.params.id)) }); } catch (e) { next(e); }
}
