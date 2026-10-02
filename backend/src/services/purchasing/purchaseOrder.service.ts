// Supplier purchase orders: draft → sent (approved) → partially_received →
// received, or closed short / cancelled. Numbers come from the gap-free 'PO' series.
import { query, queryOne, withTransaction } from '../../config/database';
import { AppError } from '../../utils/AppError';
import { writeAuditTx } from '../../utils/audit';
import { assertSupplierCanSupply } from './supplierCheck';
import { licenceLine } from '../licences/forms';
import { listLicences } from '../licences/register.service';

export interface PoInput {
  vendor_id: string;
  expected_by?: string;
  notes?: string;
  items: { product_id: string; quantity: number; unit_cost_paise: number }[];
}

export async function createPurchaseOrder(userId: string, input: PoInput) {
  return withTransaction(async (client) => {
    await assertSupplierCanSupply(client, input.vendor_id);
    const products = new Map((await client.query(
      `SELECT id, name, gst_rate, drug_schedule FROM products WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL`,
      [input.items.map((i) => i.product_id)])).rows.map((p: any) => [p.id, p]));
    let taxable = 0, gst = 0;
    for (const it of input.items) {
      const p: any = products.get(it.product_id);
      if (!p) throw new AppError('Product not found in the catalogue', 404);
      if (['Schedule X', 'NDPS'].includes(p.drug_schedule)) throw new AppError(`${p.name} is never stocked for online sale`, 400);
      taxable += it.quantity * it.unit_cost_paise;
      gst += Math.round((it.quantity * it.unit_cost_paise * p.gst_rate) / 100);
    }
    const poNumber = (await client.query(`SELECT next_invoice_number('PO', 'PO') AS n`)).rows[0].n;
    const po = (await client.query(
      `INSERT INTO purchase_orders (vendor_id, po_number, status, total_amount_paise, gst_paise, notes, raised_by, expected_by)
       VALUES ($1, $2, 'draft', $3, $4, $5, $6, $7) RETURNING id, po_number, status`,
      [input.vendor_id, poNumber, taxable + gst, gst, input.notes ?? null, userId, input.expected_by ?? null])).rows[0];
    for (const it of input.items) {
      const p: any = products.get(it.product_id);
      await client.query(
        `INSERT INTO po_items (po_id, product_id, quantity, unit_price_paise, gst_rate, total_paise) VALUES ($1, $2, $3, $4, $5, $6)`,
        [po.id, it.product_id, it.quantity, it.unit_cost_paise, p.gst_rate, it.quantity * it.unit_cost_paise]);
    }
    await writeAuditTx(client, { userId: null, action: 'purchase_order_created', performedBy: userId,
      newValue: { po_id: po.id, po_number: poNumber, vendor_id: input.vendor_id, total_paise: taxable + gst } });
    return po;
  });
}

async function transition(userId: string, id: string, from: string[], to: string, action: string, reason?: string) {
  return withTransaction(async (client) => {
    const po = (await client.query(`SELECT id, status, vendor_id, raised_by FROM purchase_orders WHERE id = $1 FOR UPDATE`, [id])).rows[0];
    if (!po) throw new AppError('Purchase order not found', 404);
    if (!from.includes(po.status)) throw new AppError(`A ${po.status.replace('_', ' ')} purchase order cannot be ${action}`, 409);
    if (to === 'sent') {
      // Raised by one admin, approved by another (C-46)
      if (po.raised_by === userId) throw new AppError('Someone other than the person who raised it must approve this purchase order', 403);
      await assertSupplierCanSupply(client, po.vendor_id);
    }
    await client.query(
      `UPDATE purchase_orders SET status = $2,
         approved_by = CASE WHEN $2::varchar = 'sent' THEN $3 ELSE approved_by END,
         approved_at = CASE WHEN $2::varchar = 'sent' THEN NOW() ELSE approved_at END,
         closed_reason = COALESCE($4, closed_reason)
       WHERE id = $1`, [id, to, userId, reason ?? null]);
    await writeAuditTx(client, { userId: null, action: `purchase_order_${action}`, performedBy: userId, newValue: { po_id: id, status: to }, notes: reason });
    return { id, status: to };
  });
}

export const approvePurchaseOrder = (userId: string, id: string) => transition(userId, id, ['draft'], 'sent', 'approved');
export const cancelPurchaseOrder = (userId: string, id: string, reason: string) => transition(userId, id, ['draft', 'sent'], 'cancelled', 'cancelled', reason);
export const closePurchaseOrder = (userId: string, id: string, reason: string) => transition(userId, id, ['partially_received'], 'closed', 'closed', reason);

export async function listPurchaseOrders(status?: string) {
  return query(
    `SELECT po.id, po.po_number, po.status, po.total_amount_paise, po.gst_paise, po.expected_by, po.raised_at, v.name AS supplier_name,
            COUNT(pi.id)::int AS lines, COALESCE(SUM(pi.quantity), 0)::int AS ordered_qty, COALESCE(SUM(pi.received_qty), 0)::int AS received_qty
     FROM purchase_orders po JOIN vendors v ON v.id = po.vendor_id LEFT JOIN po_items pi ON pi.po_id = po.id
     ${status ? 'WHERE po.status = $1' : ''} GROUP BY po.id, v.name ORDER BY po.raised_at DESC LIMIT 200`, status ? [status] : []);
}

export async function getPurchaseOrder(id: string) {
  const po = await queryOne<any>(
    `SELECT po.*, v.name AS supplier_name, v.drug_license_no, v.gst_number FROM purchase_orders po
     JOIN vendors v ON v.id = po.vendor_id WHERE po.id = $1`, [id]);
  if (!po) throw new AppError('Purchase order not found', 404);
  const items = await query(
    `SELECT pi.id, pi.product_id, p.name AS product_name, p.sku, pi.quantity, pi.received_qty, pi.unit_price_paise AS unit_cost_paise, pi.gst_rate
     FROM po_items pi JOIN products p ON p.id = pi.product_id WHERE pi.po_id = $1 ORDER BY p.name`, [id]);
  const receipts = await query(`SELECT id, grn_number, supplier_invoice_no, total_paise, created_at FROM goods_receipts WHERE po_id = $1 ORDER BY created_at`, [id]);
  // Every drug licence of the supplier, as the purchase order shows it (Sprint 30, C-02)
  const supplier_licences = (await listLicences({ vendorId: po.vendor_id })).filter((l) => l.status === 'verified');
  return { ...po, items, receipts, supplier_licences, supplier_licence_line: licenceLine(supplier_licences) };
}
