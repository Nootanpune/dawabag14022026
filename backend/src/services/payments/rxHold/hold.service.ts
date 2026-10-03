// Authorise-then-capture for prescription orders (Sprint 39; rules.ts says why).
//   recordAuthorisation — the buyer's card / UPI is authorised (checkout verify, the
//                         payment.authorized webhook, the reconciliation sweep, or the
//                         trial's demo); the order goes to the pharmacist as if paid
//   captureHeldPayment  — after the pharmacist check passes: capture at the gateway,
//                         then record it through capture.service (the one place money
//                         received is recorded)
//   releaseHeldPaymentTx — inside an order cancellation: the hold is never captured
//   runRxHoldWatch       — job: retry captures, alert staff, release timed-out holds
// Every step is audited (C-46); the buyer is never charged for a refused order (C-37).
import { PoolClient } from 'pg';
import { query, withTransaction } from '../../../config/database';
import { logger } from '../../../config/logger';
import { AppError } from '../../../utils/AppError';
import { formatDateTimeIST } from '../../../utils/ist';
import { writeAuditTx } from '../../../utils/audit';
import { getSetting } from '../../settings.service';
import { queueNotification } from '../../notification.service';
import { moveOrderToFulfilment } from '../../paymentCapture.service';
import { rxRequiredLines } from '../../rxGate.service';
import { getRazorpay } from '../../razorpay.client';
import { afterCapture, applyCaptureTx, CaptureRecord, GatewayPayment } from '../capture.service';
import { isDemoPaymentId } from '../paymentMode';
import {
  DEFAULT_RX_HOLD, HOLD_WORDING, Readiness, RxHoldSettings, authorisationGone, captureReadiness, holdAction, holdTimes, parseRxHoldSettings,
} from './rules';

type Q = Pick<PoolClient, 'query'>;

const GATEWAY_TIMEOUT_MS = 20_000;
function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  let t: NodeJS.Timeout;
  return Promise.race([p, new Promise<T>((_, reject) => { t = setTimeout(() => reject(new Error(message)), ms); })]).finally(() => clearTimeout(t));
}

export async function rxHoldSettings(db?: Q): Promise<RxHoldSettings> {
  return parseRxHoldSettings(await getSetting<unknown>('payments.rx_authorisation', DEFAULT_RX_HOLD, db));
}

/** An order with a line that needs a prescription for this buyer is authorised, not charged, at checkout. */
export async function needsManualCapture(client: PoolClient, orderId: string): Promise<boolean> {
  return (await rxRequiredLines(client, orderId)).length > 0;
}

/** Is the order's held payment ready to capture? Locks the payment row. */
export async function holdReadiness(client: PoolClient, orderId: string): Promise<Readiness & { payment?: any }> {
  const payment = (await client.query(
    `SELECT id, order_id, gateway, gateway_order_id, gateway_payment_id, amount_paise, status, method
     FROM payments WHERE order_id = $1 AND capture_mode = 'manual' AND status = 'authorized'
     ORDER BY created_at DESC LIMIT 1 FOR UPDATE`, [orderId])).rows[0];
  if (!payment) return { ready: false, reason: 'no held payment' };
  const order = (await client.query(`SELECT status FROM orders WHERE id = $1`, [orderId])).rows[0];
  const lines = await rxRequiredLines(client, orderId);
  const shipmentIds = [...new Set(lines.map((l) => l.shipment_id).filter(Boolean))];
  const rxShipments = shipmentIds.length
    ? (await client.query(`SELECT status, pharmacist_check FROM order_shipments WHERE id = ANY($1::uuid[])`, [shipmentIds])).rows : [];
  const r = captureReadiness({
    paymentStatus: payment.status, orderStatus: order?.status ?? 'missing',
    rxLinesWaiting: lines.filter((l) => !l.prescription_id).length, rxShipments,
  });
  return { ...r, payment };
}

/**
 * The authorisation of a manual-capture order payment. Returns null when the payment
 * is not one (automatic capture: Razorpay's payment.authorized precedes its capture).
 */
export async function recordAuthorisation(p: GatewayPayment, actor: string | null = null): Promise<{ outcome: string; orderId?: string } | null> {
  const r = await withTransaction(async (client) => {
    const pay = (await client.query(
      `SELECT id, order_id, amount_paise, status, capture_mode FROM payments WHERE gateway_order_id = $1 FOR UPDATE`, [p.order_id])).rows[0];
    if (!pay || pay.capture_mode !== 'manual') return null;
    if (pay.status !== 'created' && pay.status !== 'failed') return { outcome: `already ${pay.status}`, orderId: pay.order_id };
    if (Number(p.amount) !== Number(pay.amount_paise)) {
      logger.error(`Authorised amount mismatch for gateway order ${p.order_id}`);
      return { outcome: 'amount mismatch; left for accounts', orderId: pay.order_id };
    }
    const order = (await client.query('SELECT status, user_id, order_number FROM orders WHERE id = $1 FOR UPDATE', [pay.order_id])).rows[0];
    if (!['pending_payment', 'payment_failed'].includes(order.status)) {
      // Closed before the authorisation arrived: it is never captured (C-37)
      await client.query(
        `UPDATE payments SET status = 'released', gateway_payment_id = $2, method = COALESCE($3, method), authorised_at = NOW(),
           released_at = NOW(), release_reason = 'The order was closed before the payment was authorised' WHERE id = $1`,
        [pay.id, p.id, p.method ?? null]);
      await writeAuditTx(client, { userId: order.user_id, action: 'payment_authorisation_released', performedBy: actor,
        newValue: { order_id: pay.order_id, gateway_payment_id: p.id, order_status: order.status, reason: 'order closed before authorisation' } });
      return { outcome: 'order already closed: authorisation released', orderId: pay.order_id };
    }
    const t = holdTimes(new Date(), await rxHoldSettings(client));
    await client.query(
      `UPDATE payments SET status = 'authorized', gateway_payment_id = $2, method = COALESCE($3, method), authorised_at = NOW(),
         release_due_at = $4, gateway_expires_at = $5, capture_failure = NULL WHERE id = $1`,
      [pay.id, p.id, p.method ?? null, t.releaseDueAt, t.gatewayExpiresAt]);
    const status = await moveOrderToFulfilment(client, pay.order_id);
    await writeAuditTx(client, { userId: order.user_id, action: 'payment_authorised', performedBy: actor,
      newValue: { order_id: pay.order_id, gateway_order_id: p.order_id, gateway_payment_id: p.id, amount_paise: Number(p.amount),
        order_status: status, release_due_at: t.releaseDueAt.toISOString(), gateway_expires_at: t.gatewayExpiresAt.toISOString() } });
    return { outcome: `order authorised → ${status}`, orderId: pay.order_id,
      notify: { userId: order.user_id, type: 'payment_authorised', orderId: pay.order_id, orderNumber: order.order_number, amountPaise: Number(p.amount) } };
  });
  if (!r) return null;
  if ((r as any).notify) await queueNotification((r as any).notify);
  return { outcome: r.outcome, orderId: r.orderId };
}

/** Inside a cancellation: the order's held payment is released (never captured). Returns the amount released. */
export async function releaseHeldPaymentTx(client: PoolClient, orderId: string, reason: string, actor: string | null): Promise<number> {
  const rows = (await client.query(
    `UPDATE payments SET status = 'released', released_at = NOW(), release_reason = $2
     WHERE order_id = $1 AND status = 'authorized' RETURNING amount_paise, gateway_payment_id`, [orderId, reason.slice(0, 1000)])).rows;
  if (!rows.length) return 0;
  const amount = rows.reduce((s: number, r: any) => s + Number(r.amount_paise), 0);
  const o = (await client.query('SELECT user_id FROM orders WHERE id = $1', [orderId])).rows[0];
  await writeAuditTx(client, { userId: o?.user_id ?? null, action: 'payment_authorisation_released', performedBy: actor,
    newValue: { order_id: orderId, amount_paise: amount, gateway_payment_ids: rows.map((r: any) => r.gateway_payment_id) }, notes: reason });
  return amount;
}

/** Packing and dispatch wait until the held payment is captured (no goods move before the money). */
export async function assertPaymentTaken(client: Q, orderId: string): Promise<void> {
  const held = (await client.query(
    `SELECT 1 FROM payments WHERE order_id = $1 AND status = 'authorized' AND capture_mode = 'manual' LIMIT 1`, [orderId])).rows.length;
  if (held) {
    throw new AppError('The payment for this order is not taken yet. It is captured automatically once the pharmacist check of every '
      + 'prescription part has passed; pack and dispatch after that.', 409, true, 'PAYMENT_NOT_CAPTURED');
  }
}

async function authorisationLost(orderId: string, gatewayStatus: string) {
  // Imported here: cancellation.service imports this module for releaseHeldPaymentTx
  const { cancelOrder } = await import('../../cancellation.service');
  await cancelOrder(orderId, { id: null, staff: true },
    `The payment hold ended at the bank before our pharmacist's check was complete (${gatewayStatus}). ${HOLD_WORDING.released}`);
}

/**
 * After the pharmacist check: capture the held payment if the order is ready. Safe to
 * call any number of times (only a ready, authorised payment is captured). A transient
 * gateway error is recorded and retried by the watch job.
 *
 * Sprint 41 (security review #3): the whole capture — readiness, the gateway call and
 * recording it — runs under the ORDER's row lock, which a cancellation takes first too.
 * So a cancellation (buyer, staff refusal, the hold-expiry job) either happens before
 * (nothing is captured: the buyer is never charged) or waits until the capture is
 * recorded (then it refunds a captured payment as for any paid order); and two
 * concurrent callers never both ask the gateway to capture.
 */
export async function captureHeldPayment(orderId: string, actor: string | null = null): Promise<{ captured: boolean; outcome: string }> {
  const r = await withTransaction(async (client): Promise<{ captured: boolean; outcome: string; record?: CaptureRecord; lost?: string }> => {
    await client.query('SELECT id FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
    const ready = await holdReadiness(client, orderId);
    if (!ready.payment) return { captured: false, outcome: ready.ready ? 'no held payment' : ready.reason ?? 'not ready' };
    if (!ready.ready) return { captured: false, outcome: ready.reason ?? 'not ready' };
    const pay = ready.payment;
    await client.query(`UPDATE payments SET capture_attempts = capture_attempts + 1 WHERE id = $1`, [pay.id]);
    let gw: GatewayPayment;
    if (pay.gateway === 'demo' || isDemoPaymentId(pay.gateway_payment_id)) {
      // The trial's demo: no gateway, the capture is simulated (audited as demo by capture.service)
      gw = { id: pay.gateway_payment_id, order_id: pay.gateway_order_id, amount: Number(pay.amount_paise), method: pay.method, status: 'captured' };
    } else {
      try {
        // Bounded: the order stays locked while the gateway answers (a late success is found by the next try's fetch)
        gw = await withTimeout(getRazorpay().payments.capture(pay.gateway_payment_id, Number(pay.amount_paise), 'INR') as Promise<any>,
          GATEWAY_TIMEOUT_MS, 'the payment gateway did not answer in time');
      } catch (e: any) {
        const now: any = await withTimeout(getRazorpay().payments.fetch(pay.gateway_payment_id) as Promise<any>, GATEWAY_TIMEOUT_MS, 'timeout').catch(() => null);
        if (now?.status === 'captured') gw = now;
        else if (now && authorisationGone(now.status)) return { captured: false, outcome: 'authorisation ended', lost: String(now.status) };
        else {
          const why = String(e?.error?.description || e?.message || e).slice(0, 500);
          logger.error(`Capture of held payment for order ${orderId} failed: ${why}`);
          await client.query(`UPDATE payments SET capture_failure = $2 WHERE id = $1`, [pay.id, why]);
          return { captured: false, outcome: 'capture failed; retried by the payment-hold watch' };
        }
      }
    }
    const record = await applyCaptureTx(client, gw, actor);
    return { captured: true, outcome: record.outcome, record };
  });
  if (r.lost) {
    await authorisationLost(orderId, r.lost);
    return { captured: false, outcome: 'authorisation ended at the gateway: order cancelled, buyer not charged' };
  }
  if (r.record) await afterCapture(r.record);
  return { captured: r.captured, outcome: r.outcome };
}

/** Same as captureHeldPayment, never throwing: callers are pharmacist decisions that already committed. */
export async function captureHeldPaymentQuietly(orderId: string | null | undefined, actor: string | null): Promise<string | null> {
  if (!orderId) return null;
  try {
    return (await captureHeldPayment(orderId, actor)).outcome;
  } catch (e: any) {
    logger.error(`Held payment capture for order ${orderId}: ${e?.message || e}`);
    return 'capture failed; retried by the payment-hold watch';
  }
}

/** Job payment_hold_watch: capture what is ready, alert staff, release timed-out holds. */
export async function runRxHoldWatch(now = new Date()): Promise<Record<string, unknown>> {
  const s = await rxHoldSettings();
  const held = await query<any>(
    `SELECT p.id, p.order_id, p.authorised_at, p.release_due_at, p.hold_alerted_at, o.order_number
     FROM payments p JOIN orders o ON o.id = p.order_id
     WHERE p.status = 'authorized' AND p.capture_mode = 'manual' ORDER BY p.authorised_at LIMIT 500`);
  const out = { held: held.length, captured: 0, alerted: 0, released: 0, failed: 0 };
  let staff: { id: string }[] | null = null;
  for (const p of held) {
    const c = await captureHeldPayment(p.order_id).catch((e) => ({ captured: false, outcome: String(e?.message || e) }));
    if (c.captured) { out.captured++; continue; }
    const action = holdAction(now, { authorised_at: new Date(p.authorised_at), release_due_at: p.release_due_at ? new Date(p.release_due_at) : null,
      hold_alerted_at: p.hold_alerted_at ? new Date(p.hold_alerted_at) : null }, s);
    if (action === 'release') {
      try {
        const { cancelOrder } = await import('../../cancellation.service');
        await cancelOrder(p.order_id, { id: null, staff: true }, `${HOLD_WORDING.timeout} ${HOLD_WORDING.released}`);
        out.released++;
      } catch (e: any) {
        out.failed++;
        logger.error(`Payment hold watch: could not release order ${p.order_number}: ${e?.message || e}`);
      }
    } else if (action === 'alert') {
      staff ??= await query<{ id: string }>(
        `SELECT id FROM users WHERE role IN ('admin', 'super_admin', 'pharmacist_rx') AND is_active = TRUE AND deleted_at IS NULL`);
      const due = new Date(p.release_due_at ?? holdTimes(new Date(p.authorised_at), s).releaseDueAt);
      for (const u of staff) await queueNotification({ userId: u.id, type: 'payment_hold_expiring', orderId: p.order_id, orderNumber: p.order_number, dueAt: formatDateTimeIST(due) });
      await query(`UPDATE payments SET hold_alerted_at = NOW() WHERE id = $1`, [p.id]);
      out.alerted++;
    }
  }
  return out;
}
