// Goods receipt (GRN): stock enters only here, against a supplier's tax invoice.
// Checks: licensed supplier; lines match the purchase order and never exceed it;
// minimum shelf life; the batch's printed MRP is not below any Dawabag selling
// price (C-16); recalled batches refused. Each receipt is a final record (C-34)
// and the purchase register for GST input credit.
import { PoolClient } from 'pg';
import { query, queryOne, withTransaction } from '../../config/database';
import { AppError } from '../../utils/AppError';
import { writeAuditTx } from '../../utils/audit';
import { getSetting } from '../settings.service';
import { sameState } from '../shipment.service';
import { assertSupplierCanSupply } from './supplierCheck';

export interface GrnLineInput {
  po_item_id?: string; product_id: string; batch_number: string; expiry_date: string; manufactured_date?: string;
  quantity: number; free_quantity?: number; unit_cost_paise: number; printed_mrp_paise: number;
}
export interface GrnInput {
  vendor_id: string; po_id?: string; supplier_invoice_no: string; supplier_invoice_date: string; notes?: string;
  lines: GrnLineInput[];
}

const PRICE_COLS = ['offer_price_paise', 'ptr_price_paise', 'pts_price_paise', 'institutional_price_paise'] as const;

async function dawabagState(client: PoolClient) {
  const e = (await client.query(`SELECT value FROM app_settings WHERE key = 'legal.entity'`)).rows[0]?.value;
  return e?.state || 'Maharashtra';
}

export async function receiveGoods(userId: string, role: string, input: GrnInput) {
  const minShelf = Number(await getSetting('purchasing.min_shelf_life_days', 180));
  return withTransaction(async (client) => {
    const supplier = await assertSupplierCanSupply(client, input.vendor_id);
    let poItems = new Map<string, any>();
    if (input.po_id) {
      const po = (await client.query(`SELECT id, vendor_id, status FROM purchase_orders WHERE id = $1 FOR UPDATE`, [input.po_id])).rows[0];
      if (!po || po.vendor_id !== input.vendor_id) throw new AppError('Purchase order not found for this supplier', 404);
      if (!['sent', 'confirmed', 'partially_received'].includes(po.status)) throw new AppError(`Purchase order is ${po.status}; it cannot be received against`, 409);
      poItems = new Map((await client.query(`SELECT * FROM po_items WHERE po_id = $1 FOR UPDATE`, [input.po_id])).rows.map((r: any) => [r.id, r]));
    }
    const products = new Map((await client.query(
      `SELECT id, name, drug_schedule, gst_rate, ${PRICE_COLS.join(', ')} FROM products WHERE id = ANY($1::uuid[])`,
      [input.lines.map((l) => l.product_id)])).rows.map((p: any) => [p.id, p]));
    const interState = !sameState(await dawabagState(client), supplier.state);
    const today = new Date(new Date().toISOString().slice(0, 10));

    const errors: string[] = [];
    const priced = input.lines.map((l, i) => {
      const p: any = products.get(l.product_id);
      const at = `Line ${i + 1}`;
      if (!p) { errors.push(`${at}: product not found`); return null; }
      if (['Schedule X', 'NDPS'].includes(p.drug_schedule)) errors.push(`${at}: ${p.name} is never stocked for online sale`);
      if (input.po_id) {
        const pi = l.po_item_id ? poItems.get(l.po_item_id) : null;
        if (!pi || pi.product_id !== l.product_id) errors.push(`${at}: ${p.name} is not on this purchase order`);
        else {
          pi.received_qty += l.quantity;
          if (pi.received_qty > pi.quantity) errors.push(`${at}: ${p.name} — receiving more than ordered (${pi.quantity})`);
        }
      }
      const days = (Date.parse(l.expiry_date) - today.getTime()) / 864e5;
      if (days < minShelf) errors.push(`${at}: ${p.name} batch ${l.batch_number} has ${Math.max(0, Math.floor(days))} days of shelf life; at least ${minShelf} are required`);
      const above = PRICE_COLS.filter((c) => p[c] != null && p[c] > l.printed_mrp_paise);
      if (above.length) errors.push(`${at}: printed MRP ₹${(l.printed_mrp_paise / 100).toFixed(2)} is below Dawabag's ${above.map((c) => c.replace('_price_paise', '').toUpperCase()).join('/')} price for ${p.name}; lower the selling prices first (C-16)`);
      const taxable = l.quantity * l.unit_cost_paise;
      return { ...l, product: p, taxable, gst: Math.round((taxable * p.gst_rate) / 100) };
    });
    if (errors.length) throw new AppError(errors.join('; '), 422);

    const taxable = priced.reduce((s, l) => s + l!.taxable, 0);
    const gst = priced.reduce((s, l) => s + l!.gst, 0);
    const cgst = interState ? 0 : Math.round(gst / 2), sgst = interState ? 0 : gst - Math.round(gst / 2), igst = interState ? gst : 0;
    const grnNumber = (await client.query(`SELECT next_invoice_number('GRN', 'GRN') AS n`)).rows[0].n;
    let grn;
    try {
      grn = (await client.query(
        `INSERT INTO goods_receipts (grn_number, po_id, vendor_id, supplier_invoice_no, supplier_invoice_date, supplier_gstin, supplier_dl_no,
           taxable_paise, cgst_paise, sgst_paise, igst_paise, total_paise, received_by, checked_by_pharmacist, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id, grn_number`,
        [grnNumber, input.po_id ?? null, input.vendor_id, input.supplier_invoice_no, input.supplier_invoice_date, supplier.gst_number,
         supplier.drug_license_no, taxable, cgst, sgst, igst, taxable + gst, userId,
         role === 'pharmacist_rx' || role === 'pharmacist_pack' ? userId : null, input.notes ?? null])).rows[0];
    } catch (e: any) {
      if (e.code === '23505') throw new AppError(`Supplier invoice ${input.supplier_invoice_no} has already been received`, 409);
      throw e;
    }

    for (const l of priced) {
      const units = l!.quantity + (l!.free_quantity ?? 0);
      const unitCost = Math.round(l!.taxable / units);   // free goods lower the cost per unit
      // Same batch already on the shelf (same expiry and MRP): add to it; recalled batches are refused
      const existing = (await client.query(
        `SELECT id, is_recalled, expiry_date, printed_mrp_paise FROM inventory_batches
         WHERE product_id = $1 AND batch_number = $2 FOR UPDATE`, [l!.product_id, l!.batch_number])).rows[0];
      let batchId: string;
      if (existing?.is_recalled) throw new AppError(`${l!.product.name} batch ${l!.batch_number} is recalled and cannot be received`, 409);
      if (existing && new Date(existing.expiry_date).toISOString().slice(0, 10) === l!.expiry_date
          && (existing.printed_mrp_paise == null || existing.printed_mrp_paise === l!.printed_mrp_paise)) {
        batchId = existing.id;
        await client.query(`UPDATE inventory_batches SET quantity_available = quantity_available + $2, printed_mrp_paise = $3 WHERE id = $1`,
          [batchId, units, l!.printed_mrp_paise]);
      } else if (existing) {
        throw new AppError(`${l!.product.name} batch ${l!.batch_number} is already on the shelf with a different expiry or MRP; check the invoice`, 409);
      } else {
        batchId = (await client.query(
          `INSERT INTO inventory_batches (product_id, vendor_id, batch_number, quantity_available, purchase_price_paise, expiry_date,
             manufactured_date, printed_mrp_paise)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
          [l!.product_id, input.vendor_id, l!.batch_number, units, unitCost, l!.expiry_date, l!.manufactured_date ?? null, l!.printed_mrp_paise])).rows[0].id;
      }
      const line = (await client.query(
        `INSERT INTO grn_lines (grn_id, po_item_id, product_id, batch_id, batch_number, expiry_date, manufactured_date, quantity,
           free_quantity, unit_cost_paise, printed_mrp_paise, gst_rate, taxable_paise, gst_paise)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
        [grn.id, l!.po_item_id ?? null, l!.product_id, batchId, l!.batch_number, l!.expiry_date, l!.manufactured_date ?? null,
         l!.quantity, l!.free_quantity ?? 0, l!.unit_cost_paise, l!.printed_mrp_paise, l!.product.gst_rate, l!.taxable, l!.gst])).rows[0];
      await client.query(`UPDATE inventory_batches SET grn_line_id = COALESCE(grn_line_id, $2) WHERE id = $1`, [batchId, line.id]);
    }

    if (input.po_id) {
      for (const pi of poItems.values()) await client.query(`UPDATE po_items SET received_qty = $2 WHERE id = $1`, [pi.id, pi.received_qty]);
      const left = [...poItems.values()].some((pi) => pi.received_qty < pi.quantity);
      await client.query(`UPDATE purchase_orders SET status = $2, received_at = CASE WHEN $2::varchar = 'received' THEN NOW() ELSE received_at END WHERE id = $1`,
        [input.po_id, left ? 'partially_received' : 'received']);
    }
    await writeAuditTx(client, { userId: null, action: 'goods_received', performedBy: userId,
      newValue: { grn_id: grn.id, grn_number: grnNumber, vendor_id: input.vendor_id, po_id: input.po_id ?? null, total_paise: taxable + gst, lines: priced.length } });
    return { id: grn.id, grn_number: grnNumber, taxable_paise: taxable, gst_paise: gst, total_paise: taxable + gst };
  });
}

export async function listGoodsReceipts(from?: string, to?: string) {
  return query(
    `SELECT g.id, g.grn_number, g.supplier_invoice_no, g.supplier_invoice_date, g.total_paise, g.created_at,
            v.name AS supplier_name, po.po_number
     FROM goods_receipts g JOIN vendors v ON v.id = g.vendor_id LEFT JOIN purchase_orders po ON po.id = g.po_id
     ${from && to ? 'WHERE g.created_at::date BETWEEN $1 AND $2' : ''} ORDER BY g.created_at DESC LIMIT 300`, from && to ? [from, to] : []);
}

export async function getGoodsReceipt(id: string) {
  const g = await queryOne<any>(
    `SELECT g.*, v.name AS supplier_name, po.po_number FROM goods_receipts g JOIN vendors v ON v.id = g.vendor_id
     LEFT JOIN purchase_orders po ON po.id = g.po_id WHERE g.id = $1`, [id]);
  if (!g) throw new AppError('Goods receipt not found', 404);
  const lines = await query(`SELECT l.*, p.name AS product_name, p.sku FROM grn_lines l JOIN products p ON p.id = l.product_id WHERE l.grn_id = $1`, [id]);
  return { ...g, lines };
}
