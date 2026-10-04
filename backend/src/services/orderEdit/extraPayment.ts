// The second payment for an order change that raised the order's value before the invoice
// (Sprint 44; rules.ts). The buyer pays the difference through the same checkout as the order
// (POST /payments/create-order with order_edit_id, then /payments/verify; the trial's demo
// /payments/demo with order_edit_id). An order holding prescription medicines is authorised
// only and captured after the pharmacist's check, exactly as the order's own payment
// (Sprint 39, C-08, C-37). The pharmacist cannot approve the order until it is made
// (pharmacistCheck/check.service assertReleasableTx).
//
// Recording (inside capture.service / rxHold hold.service, which call these):
//   authorised → order_edits.extra_status 'authorised'; captured → 'paid'. A payment for a
//   change that is no longer owed (replaced by a later change, or the order cancelled) is
//   released (held) or refunded (captured) — the buyer never pays twice (C-37).
import { PoolClient } from 'pg';
import { queryOne } from '../../config/database';
import { AppError } from '../../utils/AppError';
import { writeAuditTx } from '../../utils/audit';

export interface EditPaymentTarget { orderEditId: string; amountPaise: number; orderNumber: string }

/** The change the buyer is paying for: their own order's, still awaiting its payment. */
export async function editPaymentTarget(userId: string, orderId: string, orderEditId: string): Promise<EditPaymentTarget> {
  const e = await queryOne<{ id: string; extra_paise: number; extra_status: string; order_number: string; user_id: string; order_status: string }>(
    `SELECT e.id, e.extra_paise, e.extra_status, o.order_number, o.user_id, o.status AS order_status
     FROM order_edits e JOIN orders o ON o.id = e.order_id WHERE e.id = $1 AND e.order_id = $2 AND o.deleted_at IS NULL`, [orderEditId, orderId]);
  if (!e || e.user_id !== userId) throw new AppError('Order change not found', 404);
  if (e.order_status === 'cancelled') throw new AppError('This order is cancelled; nothing to pay', 409);
  if (e.extra_status !== 'awaiting_payment') {
    throw new AppError(e.extra_status === 'superseded' ? 'A later change replaced this one; pay the latest difference on the order page.'
      : 'Nothing is waiting to be paid for this change', 409, true, 'NOTHING_TO_PAY');
  }
  if (Number(e.extra_paise) <= 0) throw new AppError('Nothing to pay for this change', 400);
  return { orderEditId: e.id, amountPaise: Number(e.extra_paise), orderNumber: e.order_number };
}

/**
 * Is the change behind this payment still owed by THIS payment? Locks the order first (the
 * order the edit, a cancellation and a held capture lock first too — no deadlock), then the
 * change row.
 *
 * Sprint 48 (security review 41–47 #1): a change is paid by ONE payment. The buyer can open
 * several gateway orders for the same change (two tabs, a retry) and complete more than one;
 * before Sprint 48 every authorisation of an 'authorised' change was accepted as owed too, so
 * two holds were captured — and a later lowering change counted both as paid, refunding the
 * buyer more than they overpaid (double money movement). Now an authorisation is owed only
 * while the change is still 'awaiting_payment'; a capture is owed for an 'awaiting_payment'
 * change, or for an 'authorised' one only when this very payment holds the authorisation.
 * Anything else is released (held) or refunded (captured) at once (C-37).
 */
async function stillOwed(client: PoolClient, orderEditId: string, orderId: string, stage: 'authorise' | 'capture',
  paymentStatus?: string): Promise<{ owed: boolean; userId: string; status: string }> {
  const o = (await client.query(`SELECT status, user_id FROM orders WHERE id = $1 FOR UPDATE`, [orderId])).rows[0];
  const e = (await client.query(`SELECT extra_status FROM order_edits WHERE id = $1 AND order_id = $2 FOR UPDATE`, [orderEditId, orderId])).rows[0];
  const open = !!e && o?.status !== 'cancelled';
  const owed = open && (e.extra_status === 'awaiting_payment'
    || (stage === 'capture' && e.extra_status === 'authorised' && paymentStatus === 'authorized'));
  return { owed, userId: o?.user_id, status: e?.extra_status };
}

/** Authorisation of a change's payment (held for the pharmacist's check). Returns the outcome word. */
export async function recordEditAuthorisationTx(client: PoolClient, pay: { id: string; order_id: string; order_edit_id: string },
  gw: { id: string; method?: string }, times: { releaseDueAt: Date; gatewayExpiresAt: Date }, actor: string | null): Promise<string> {
  const s = await stillOwed(client, pay.order_edit_id, pay.order_id, 'authorise');
  if (!s.owed) {
    await client.query(
      `UPDATE payments SET status = 'released', gateway_payment_id = $2, method = COALESCE($3, method), authorised_at = NOW(),
         released_at = NOW(), release_reason = 'The order change this paid for is no longer owed' WHERE id = $1`,
      [pay.id, gw.id, gw.method ?? null]);
    await writeAuditTx(client, { userId: s.userId, action: 'payment_authorisation_released', performedBy: actor,
      newValue: { order_id: pay.order_id, order_edit_id: pay.order_edit_id, gateway_payment_id: gw.id, reason: s.status === 'authorised' ? 'order change already held by another payment' : 'order change no longer owed' } });
    return 'order change no longer owed: authorisation released';
  }
  await client.query(
    `UPDATE payments SET status = 'authorized', gateway_payment_id = $2, method = COALESCE($3, method), authorised_at = NOW(),
       release_due_at = $4, gateway_expires_at = $5, capture_failure = NULL WHERE id = $1`,
    [pay.id, gw.id, gw.method ?? null, times.releaseDueAt, times.gatewayExpiresAt]);
  await client.query(`UPDATE order_edits SET extra_status = 'authorised' WHERE id = $1`, [pay.order_edit_id]);
  await writeAuditTx(client, { userId: s.userId, action: 'order_edit_payment_authorised', performedBy: actor,
    newValue: { order_id: pay.order_id, order_edit_id: pay.order_edit_id, gateway_payment_id: gw.id } });
  return 'order change payment authorised';
}

/** Capture of a change's payment (now, or after the pharmacist's check). 'refund' = take the money straight back. */
export async function recordEditCaptureTx(client: PoolClient, pay: { order_id: string; order_edit_id: string; status?: string }, gwId: string,
  actor: string | null): Promise<'paid' | 'refund'> {
  const s = await stillOwed(client, pay.order_edit_id, pay.order_id, 'capture', pay.status);
  if (!s.owed) {
    await writeAuditTx(client, { userId: s.userId, action: 'payment_after_close_refunded', performedBy: actor,
      newValue: { order_id: pay.order_id, order_edit_id: pay.order_edit_id, gateway_payment_id: gwId, reason: 'order change no longer owed' } });
    return 'refund';
  }
  await client.query(`UPDATE order_edits SET extra_status = 'paid' WHERE id = $1`, [pay.order_edit_id]);
  await writeAuditTx(client, { userId: s.userId, action: 'order_edit_paid', performedBy: actor,
    newValue: { order_id: pay.order_id, order_edit_id: pay.order_edit_id, gateway_payment_id: gwId } });
  return 'paid';
}
