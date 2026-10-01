// Purchase returns: stock going back to the supplier — recalled, expired, near-expiry,
// damaged, excess or wrong goods (C-28). Raised by the store, approved by a second
// person (never the requester, C-46), which takes the stock out of each batch as an
// approved 'return_to_supplier' adjustment. The goods leave under a dispatch
// reference (e-way bill / LR) and the return is settled when the supplier's credit
// note arrives. Numbered 'PRN/2627/00001'; feeds the purchase-returns register.
import { query, queryOne, withTransaction } from '../../config/database';
import { AppError } from '../../utils/AppError';
import { writeAuditTx } from '../../utils/audit';
import { sameState } from '../shipment.service';
import { applyAdjustment, createAdjustment } from '../stock/adjustment.service';
import { dawabagState } from './goodsReceipt.service';
import { assertOpenPeriod } from '../accountsLock';

export const RETURN_REASONS = ['recalled', 'expired', 'near_expiry', 'damaged', 'excess', 'wrong_item'] as const;
export interface ReturnInput { vendor_id: string; reason: typeof RETURN_REASONS[number]; notes: string; lines: { batch_id: string; quantity: number }[] }

export async function requestReturn(userId: string, input: ReturnInput) {
  return withTransaction(async (client) => {
    const v = (await client.query(`SELECT id, name, vendor_type, state FROM vendors WHERE id = $1`, [input.vendor_id])).rows[0];
    if (!v || !['supplier', 'both'].includes(v.vendor_type)) throw new AppError('Supplier not found', 404);
    const batches = new Map((await client.query(
      `SELECT b.id, b.product_id, b.batch_number, b.quantity_available, b.quantity_reserved, b.purchase_price_paise,
              p.name, p.gst_rate, COALESCE(g.vendor_id, b.vendor_id) AS grn_vendor
       FROM inventory_batches b JOIN products p ON p.id = b.product_id
       LEFT JOIN grn_lines gl ON gl.id = b.grn_line_id LEFT JOIN goods_receipts g ON g.id = gl.grn_id
       WHERE b.id = ANY($1::uuid[]) FOR UPDATE OF b`, [input.lines.map((l) => l.batch_id)])).rows.map((b: any) => [b.id, b]));
    const errors: string[] = [];
    const lines = input.lines.map((l, i) => {
      const b: any = batches.get(l.batch_id);
      const at = `Line ${i + 1}`;
      if (!b) { errors.push(`${at}: batch not found`); return null; }
      if (b.grn_vendor && b.grn_vendor !== input.vendor_id) errors.push(`${at}: ${b.name} batch ${b.batch_number} was received from another supplier`);
      const free = b.quantity_available - b.quantity_reserved;
      if (l.quantity > free) errors.push(`${at}: only ${free} unit(s) of ${b.name} batch ${b.batch_number} are free to return`);
      const taxable = l.quantity * b.purchase_price_paise;
      return { ...l, product_id: b.product_id, unit_cost: b.purchase_price_paise, gst_rate: b.gst_rate, taxable, gst: Math.round((taxable * b.gst_rate) / 100) };
    });
    if (errors.length) throw new AppError(errors.join('; '), 422);
    const taxable = lines.reduce((s, l) => s + l!.taxable, 0);
    const gst = lines.reduce((s, l) => s + l!.gst, 0);
    const inter = !sameState(await dawabagState(client), v.state);
    const half = Math.round(gst / 2);
    const no = (await client.query(`SELECT next_invoice_number('PRN', 'PRN') AS n`)).rows[0].n;
    const r = (await client.query(
      `INSERT INTO purchase_returns (return_no, vendor_id, reason, notes, taxable_paise, cgst_paise, sgst_paise, igst_paise, total_paise, requested_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id, return_no, status, total_paise`,
      [no, v.id, input.reason, input.notes, taxable, inter ? 0 : half, inter ? 0 : gst - half, inter ? gst : 0, taxable + gst, userId])).rows[0];
    for (const l of lines) {
      await client.query(
        `INSERT INTO purchase_return_lines (return_id, batch_id, product_id, quantity, unit_cost_paise, gst_rate, taxable_paise, gst_paise)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [r.id, l!.batch_id, l!.product_id, l!.quantity, l!.unit_cost, l!.gst_rate, l!.taxable, l!.gst]);
    }
    await writeAuditTx(client, { userId: null, action: 'purchase_return_requested', performedBy: userId,
      newValue: { return_id: r.id, return_no: no, vendor_id: v.id, reason: input.reason, total_paise: taxable + gst } });
    return r;
  });
}

async function lockReturn(client: any, id: string) {
  const r = (await client.query(`SELECT * FROM purchase_returns WHERE id = $1 FOR UPDATE`, [id])).rows[0];
  if (!r) throw new AppError('Purchase return not found', 404);
  return r;
}

// Second person approves: stock leaves each batch now (or nothing does)
export async function decideReturn(approverId: string, id: string, approve: boolean, notes: string) {
  return withTransaction(async (client) => {
    const r = await lockReturn(client, id);
    if (r.status !== 'requested') throw new AppError(`Return is already ${r.status}`, 409);
    if (r.requested_by === approverId) throw new AppError('Someone other than the requester must decide', 403);
    if (!approve) {
      await client.query(`UPDATE purchase_returns SET status = 'rejected', approved_by = $2, decided_at = NOW(), decision_notes = $3 WHERE id = $1`, [id, approverId, notes]);
      await writeAuditTx(client, { userId: null, action: 'purchase_return_rejected', performedBy: approverId, newValue: { return_id: id }, notes });
      return { id, status: 'rejected' };
    }
    const lines = (await client.query(`SELECT id, batch_id, quantity FROM purchase_return_lines WHERE return_id = $1`, [id])).rows;
    for (const l of lines) {
      const adj = await createAdjustment(client, r.requested_by, { batch_id: l.batch_id, quantity_delta: -l.quantity,
        reason: 'return_to_supplier', notes: `Purchase return ${r.return_no}: ${r.reason}` });
      await applyAdjustment(client, approverId, adj.id, `Purchase return ${r.return_no} approved`);
      await client.query(`UPDATE purchase_return_lines SET adjustment_id = $2 WHERE id = $1`, [l.id, adj.id]);
    }
    await client.query(`UPDATE purchase_returns SET status = 'approved', approved_by = $2, decided_at = NOW(), decision_notes = $3 WHERE id = $1`, [id, approverId, notes]);
    await writeAuditTx(client, { userId: null, action: 'purchase_return_approved', performedBy: approverId, newValue: { return_id: id, lines: lines.length }, notes });
    return { id, status: 'approved' };
  });
}

export async function dispatchReturn(userId: string, id: string, reference: string) {
  return withTransaction(async (client) => {
    const r = await lockReturn(client, id);
    if (r.status !== 'approved') throw new AppError('Only an approved return can be dispatched', 409);
    if (r.requested_by === userId) throw new AppError('Someone other than the person who raised the return must hand it over', 403);
    await client.query(`UPDATE purchase_returns SET status = 'dispatched', dispatched_by = $2, dispatched_at = NOW(), dispatch_reference = $3 WHERE id = $1`, [id, userId, reference]);
    await writeAuditTx(client, { userId: null, action: 'purchase_return_dispatched', performedBy: userId, newValue: { return_id: id, reference } });
    return { id, status: 'dispatched' };
  });
}

// The supplier's credit note closes the return (input tax reversed by the CA from the register)
export async function settleReturn(userId: string, id: string, cn: { number: string; date: string; amount_paise: number }) {
  return withTransaction(async (client) => {
    const r = await lockReturn(client, id);
    if (r.status !== 'dispatched') throw new AppError('Record the supplier credit note after the goods are dispatched', 409);
    if (cn.date < new Date(r.dispatched_at).toISOString().slice(0, 10)) throw new AppError('Credit note date is before the goods left', 400);
    await assertOpenPeriod(cn.date, 'A supplier credit note', client);
    await client.query(
      `UPDATE purchase_returns SET status = 'settled', supplier_credit_note_no = $2, supplier_credit_note_date = $3, supplier_credit_paise = $4,
         settled_by = $5, settled_at = NOW() WHERE id = $1`, [id, cn.number, cn.date, cn.amount_paise, userId]);
    await writeAuditTx(client, { userId: null, action: 'purchase_return_settled', performedBy: userId,
      newValue: { return_id: id, credit_note: cn.number, amount_paise: cn.amount_paise, expected_paise: Number(r.total_paise) } });
    return { id, status: 'settled', difference_paise: cn.amount_paise - Number(r.total_paise) };
  });
}

const LIST = `SELECT r.id, r.return_no, r.vendor_id, v.name AS supplier_name, v.gst_number AS supplier_gstin, r.reason, r.status, r.notes,
                     r.taxable_paise, r.cgst_paise, r.sgst_paise, r.igst_paise, r.total_paise, r.created_at, r.decided_at, r.decision_notes,
                     r.dispatched_at, r.dispatch_reference, r.supplier_credit_note_no, r.supplier_credit_note_date, r.supplier_credit_paise, r.settled_at,
                     r.requested_by, ru.full_name AS requested_by_name, r.approved_by, au.full_name AS approved_by_name
              FROM purchase_returns r JOIN vendors v ON v.id = r.vendor_id
              LEFT JOIN user_profiles ru ON ru.user_id = r.requested_by LEFT JOIN user_profiles au ON au.user_id = r.approved_by`;

export async function listReturns(status?: string) {
  return query(`${LIST} ${status ? 'WHERE r.status = $1' : ''} ORDER BY r.created_at DESC LIMIT 300`, status ? [status] : []);
}

export async function getReturn(id: string) {
  const r = await queryOne<any>(`${LIST} WHERE r.id = $1`, [id]);
  if (!r) throw new AppError('Purchase return not found', 404);
  const lines = await query(
    `SELECT l.*, p.name AS product_name, p.sku, b.batch_number, b.expiry_date, a.adjustment_no
     FROM purchase_return_lines l JOIN products p ON p.id = l.product_id JOIN inventory_batches b ON b.id = l.batch_id
     LEFT JOIN stock_adjustments a ON a.id = l.adjustment_id WHERE l.return_id = $1 ORDER BY p.name`, [id]);
  return { ...r, lines };
}
