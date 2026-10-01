// src/services/return.service.ts — returns after delivery (Rulebook C-37)
// Medicines are never restocked once they leave the seller. Damaged, wrong,
// missing, expired, near-expiry, quality-issue and recalled deliveries are
// refunded: approval issues a credit note in the seller's series, refunds the
// buyer's share (after any order discount), and — for partner shipments —
// records a settlement deduction so Dawabag recovers it from the partner.
import { query, queryOne, withTransaction } from '../config/database';
import { AppError } from '../utils/AppError';
import { writeAuditTx } from '../utils/audit';
import { issueCreditNote } from './creditNote.service';
import { queueNotification } from './notification.service';
import { recordRefund, refundableAmount, sendGatewayRefunds } from './refund.service';
import { getSetting } from './settings.service';

export const RETURN_REASONS = ['damaged', 'wrong_item', 'missing_item', 'expired', 'near_expiry', 'quality_issue', 'recalled'] as const;
export type ReturnReason = typeof RETURN_REASONS[number];
const QUICK = ['damaged', 'wrong_item', 'missing_item'];   // must be reported within hours of delivery

export interface ReturnInput {
  shipment_id: string;
  reason: ReturnReason;
  description: string;
  items: { order_item_id: string; quantity: number }[];
}

// The windows buyers see in help text come from the same settings the server enforces
export async function returnWindows() {
  return {
    report_within_hours: Number(await getSetting('returns.report_within_hours', 48)),
    expiry_claim_days: Number(await getSetting('returns.expiry_claim_days', 30)),
    near_expiry_days: Number(await getSetting('returns.near_expiry_days', 90)),
  };
}

export async function createReturn(userId: string, input: ReturnInput) {
  const hours = Number(await getSetting('returns.report_within_hours', 48));
  const claimDays = Number(await getSetting('returns.expiry_claim_days', 30));
  return withTransaction(async (client) => {
    const s = (await client.query(
      `SELECT s.id, s.status, s.delivered_at, s.order_id, o.user_id, o.order_number
       FROM order_shipments s JOIN orders o ON o.id = s.order_id
       WHERE s.id = $1 AND o.user_id = $2 FOR UPDATE OF s`, [input.shipment_id, userId])).rows[0];
    if (!s) throw new AppError('Shipment not found', 404);
    if (s.status !== 'delivered' || !s.delivered_at) throw new AppError('Returns open once the shipment is delivered', 409);
    const ageHours = (Date.now() - new Date(s.delivered_at).getTime()) / 36e5;
    if (QUICK.includes(input.reason) && ageHours > hours) {
      throw new AppError(`Damaged, wrong or missing items must be reported within ${hours} hours of delivery`, 409);
    }
    if (!QUICK.includes(input.reason) && input.reason !== 'recalled' && ageHours > claimDays * 24) {
      throw new AppError(`This kind of claim must be made within ${claimDays} days of delivery`, 409);
    }

    for (const it of input.items) {
      const line = (await client.query(
        `SELECT oi.quantity, oi.product_id, COALESCE(ib.batch_number, pi.batch_number) AS batch_number,
                COALESCE((SELECT SUM(ri.quantity) FROM return_items ri JOIN return_requests rr ON rr.id = ri.return_id
                          WHERE ri.order_item_id = oi.id AND rr.status IN ('requested', 'approved', 'closed')), 0)::int AS returned
         FROM order_items oi
         LEFT JOIN inventory_batches ib ON ib.id = oi.batch_id
         LEFT JOIN partner_order_items poi ON poi.order_item_id = oi.id
         LEFT JOIN partner_inventory pi ON pi.id = poi.partner_inv_id
         WHERE oi.id = $1 AND oi.shipment_id = $2`, [it.order_item_id, s.id])).rows[0];
      if (!line) throw new AppError('Item is not part of this shipment', 400);
      if (it.quantity > line.quantity - line.returned) {
        throw new AppError(`Only ${line.quantity - line.returned} unit(s) of this item can still be returned`, 400);
      }
      if (input.reason === 'recalled') {
        const recalled = (await client.query(
          `SELECT 1 FROM batch_recalls WHERE product_id = $1 AND batch_number = $2`, [line.product_id, line.batch_number])).rows[0];
        if (!recalled) throw new AppError('This batch has not been recalled; choose another reason', 400);
      }
    }

    const seq = (await client.query(`SELECT nextval('return_no_seq') AS n`)).rows[0].n;
    const returnNo = `RET-${new Date().getFullYear()}-${String(seq).padStart(6, '0')}`;
    const r = (await client.query(
      `INSERT INTO return_requests (return_no, order_id, shipment_id, user_id, reason, description)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, return_no, status, created_at`,
      [returnNo, s.order_id, s.id, userId, input.reason, input.description])).rows[0];
    for (const it of input.items) {
      await client.query(`INSERT INTO return_items (return_id, order_item_id, quantity) VALUES ($1, $2, $3)`,
        [r.id, it.order_item_id, it.quantity]);
    }
    await writeAuditTx(client, { userId, action: 'return_requested', performedBy: userId,
      newValue: { return_id: r.id, return_no: returnNo, order_id: s.order_id, reason: input.reason } });
    return r;
  });
}

const LIST_SQL = `
  SELECT r.id, r.return_no, r.order_id, o.order_number, r.shipment_id, s.seller_type, s.partner_id,
         v.name AS partner_name, r.reason, r.description, r.status, r.refund_paise, r.decision_notes,
         r.disposition, r.created_at, r.decided_at, up.full_name AS buyer_name
  FROM return_requests r
  JOIN orders o ON o.id = r.order_id
  JOIN order_shipments s ON s.id = r.shipment_id
  LEFT JOIN vendors v ON v.id = s.partner_id
  LEFT JOIN user_profiles up ON up.user_id = r.user_id`;

export async function listReturns(filter: { userId?: string; partnerId?: string; status?: string }) {
  const where: string[] = [];
  const params: any[] = [];
  if (filter.userId) { params.push(filter.userId); where.push(`r.user_id = $${params.length}`); }
  if (filter.partnerId) { params.push(filter.partnerId); where.push(`s.partner_id = $${params.length}`); }
  if (filter.status) { params.push(filter.status); where.push(`r.status = $${params.length}`); }
  return query(`${LIST_SQL} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY r.created_at DESC LIMIT 500`, params);
}

export async function getReturn(id: string, scope: { userId?: string; partnerId?: string } = {}) {
  const params: any[] = [id];
  let extra = '';
  if (scope.userId) { params.push(scope.userId); extra += ` AND r.user_id = $${params.length}`; }
  if (scope.partnerId) { params.push(scope.partnerId); extra += ` AND s.partner_id = $${params.length}`; }
  const r = await queryOne<any>(`${LIST_SQL} WHERE r.id = $1${extra}`, params);
  if (!r) throw new AppError('Return not found', 404);
  const items = await query(
    `SELECT ri.order_item_id, ri.quantity, oi.product_name, oi.quantity AS delivered_qty, oi.line_total_paise,
            COALESCE(ib.batch_number, pi.batch_number) AS batch_number, COALESCE(ib.expiry_date, pi.expiry_date) AS expiry_date
     FROM return_items ri JOIN order_items oi ON oi.id = ri.order_item_id
     LEFT JOIN inventory_batches ib ON ib.id = oi.batch_id
     LEFT JOIN partner_order_items poi ON poi.order_item_id = oi.id
     LEFT JOIN partner_inventory pi ON pi.id = poi.partner_inv_id
     WHERE ri.return_id = $1`, [id]);
  const creditNotes = await query(`SELECT id, credit_note_number, total_paise, created_at FROM credit_notes WHERE return_id = $1`, [id]);
  const refunds = await query(`SELECT method, amount_paise, status, processed_at FROM refunds WHERE return_id = $1`, [id]);
  return { ...r, items, credit_notes: creditNotes, refunds };
}

export async function decideReturn(staffId: string, id: string, approve: boolean, notes: string) {
  const res = await withTransaction(async (client) => {
    const r = (await client.query(`SELECT * FROM return_requests WHERE id = $1 FOR UPDATE`, [id])).rows[0];
    if (!r) throw new AppError('Return not found', 404);
    if (r.status !== 'requested') throw new AppError(`Return is already ${r.status}`, 409);
    if (!approve) {
      await client.query(
        `UPDATE return_requests SET status = 'rejected', decided_by = $2, decided_at = NOW(), decision_notes = $3 WHERE id = $1`,
        [id, staffId, notes]);
      await writeAuditTx(client, { userId: r.user_id, action: 'return_rejected', performedBy: staffId, newValue: { return_id: id }, notes });
      return { r, status: 'rejected', refund: null, cn: null };
    }

    const lines = (await client.query(`SELECT order_item_id, quantity FROM return_items WHERE return_id = $1`, [id])).rows;
    const cn = await issueCreditNote(client, { shipmentId: r.shipment_id, reason: `return_${r.reason}`, lines, returnId: id, userId: staffId });
    // Buyer gets back what they paid for these goods: invoice value less their share of any order discount
    const o = (await client.query(`SELECT subtotal_paise, gst_paise, discount_paise FROM orders WHERE id = $1`, [r.order_id])).rows[0];
    const goods = Number(o.subtotal_paise) + Number(o.gst_paise);
    const share = goods > 0 ? Math.round(cn.total_paise * (goods - Number(o.discount_paise)) / goods) : 0;
    // Never more than is still refundable on the order (earlier refunds count)
    const refundPaise = Math.min(share, await refundableAmount(client, r.order_id));
    const refund = await recordRefund(client, { orderId: r.order_id, amountPaise: refundPaise, source: 'return', returnId: id, userId: staffId });
    if (cn.partner_id) {
      await client.query(
        `INSERT INTO settlement_adjustments (partner_id, return_id, credit_note_id, taxable_paise, gst_paise, reason)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [cn.partner_id, id, cn.id, -cn.taxable_paise, -cn.gst_paise, `Return ${r.return_no} (${r.reason})`]);
    }
    await client.query(
      `UPDATE return_requests SET status = 'approved', decided_by = $2, decided_at = NOW(), decision_notes = $3, refund_paise = $4
       WHERE id = $1`, [id, staffId, notes, refundPaise]);
    await markFullyReturned(client, r.shipment_id, r.order_id);
    await writeAuditTx(client, { userId: r.user_id, action: 'return_approved', performedBy: staffId,
      newValue: { return_id: id, credit_note: cn.credit_note_number, refund_paise: refundPaise }, notes });
    return { r, status: 'approved', refund, cn, refundPaise };
  });

  if (res.refund) await sendGatewayRefunds(res.refund.gatewayRefundIds);
  await queueNotification({ userId: res.r.user_id, type: 'return_update', returnNo: res.r.return_no,
    status: res.status, amountPaise: (res as any).refundPaise ?? 0, reason: notes });
  return { id, status: res.status, refund_paise: (res as any).refundPaise ?? 0,
    credit_note_number: res.cn?.credit_note_number ?? null, refunds: res.refund?.legs ?? [] };
}

// Shipment 'returned' once every unit is covered by approved returns; order
// 'returned' once no shipment still stands.
async function markFullyReturned(client: any, shipmentId: string, orderId: string) {
  const open = (await client.query(
    `SELECT COUNT(*)::int AS n FROM order_items oi
     WHERE oi.shipment_id = $1 AND oi.quantity > COALESCE((SELECT SUM(ri.quantity) FROM return_items ri
       JOIN return_requests rr ON rr.id = ri.return_id WHERE ri.order_item_id = oi.id AND rr.status IN ('approved', 'closed')), 0)`,
    [shipmentId])).rows[0].n;
  if (open > 0) return;
  await client.query(`UPDATE order_shipments SET status = 'returned' WHERE id = $1`, [shipmentId]);
  await client.query(`UPDATE partner_order_items SET dispatch_status = 'returned' WHERE shipment_id = $1`, [shipmentId]);
  const standing = (await client.query(
    `SELECT COUNT(*)::int AS n FROM order_shipments WHERE order_id = $1 AND status NOT IN ('returned', 'cancelled')`, [orderId])).rows[0].n;
  if (standing === 0) await client.query(`UPDATE orders SET status = 'returned', updated_at = NOW() WHERE id = $1`, [orderId]);
}

// Goods collected back: destroyed or sent to the supplier — never restocked (C-37)
export async function recordDisposition(staffId: string, id: string, disposition: 'destroyed' | 'returned_to_supplier' | 'not_collected') {
  return withTransaction(async (client) => {
    const r = (await client.query(`SELECT id, user_id, status FROM return_requests WHERE id = $1 FOR UPDATE`, [id])).rows[0];
    if (!r) throw new AppError('Return not found', 404);
    if (r.status !== 'approved') throw new AppError('Only approved returns can be closed', 409);
    await client.query(
      `UPDATE return_requests SET status = 'closed', disposition = $2, disposed_at = NOW(), disposed_by = $3 WHERE id = $1`,
      [id, disposition, staffId]);
    await writeAuditTx(client, { userId: r.user_id, action: 'return_closed', performedBy: staffId, newValue: { return_id: id, disposition } });
    return { id, status: 'closed', disposition };
  });
}
