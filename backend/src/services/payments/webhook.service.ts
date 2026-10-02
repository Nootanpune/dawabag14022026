// Razorpay webhooks. Each event is acted on once — Razorpay retries, so the event
// id is recorded first and a repeat is acknowledged without acting again. If
// acting fails the record is removed so Razorpay's retry gets another go.
// Only ids and amounts are kept (C-41). Signature is checked by the controller.
import crypto from 'crypto';
import { query, queryOne, withTransaction } from '../../config/database';
import { logger } from '../../config/logger';
import { applyTokenEvent } from '../mandate.service';
import { settleGatewayLeg } from '../refund.service';
import { applyCapture } from './capture.service';
import { consultationRefundEvent } from '../telemedicine/consultationFee.service';

// Also the demo payment's "Simulate failure" (demoPayment.service)
export async function paymentFailed(p: any): Promise<string> {
  if (!p?.order_id) return 'no order id';
  // A late or replayed failure never overrides a payment that went through
  const r = await query(`UPDATE payments SET status = 'failed' WHERE gateway_order_id = $1 AND status NOT IN ('captured', 'partially_refunded', 'refunded') RETURNING order_id`, [p.order_id]);
  if (!r.length) return 'no open payment';
  await query(`UPDATE orders SET status = 'payment_failed' WHERE id = $1 AND status = 'pending_payment'`, [(r[0] as any).order_id]);
  return 'order payment failed';
}

async function refundEvent(event: string, rf: any): Promise<string> {
  const leg = await queryOne<{ id: string; status: string }>(`SELECT id, status FROM refunds WHERE gateway_refund_id = $1`, [rf?.id]);
  if (!leg) {
    const consult = await consultationRefundEvent(event, rf);
    if (consult) return consult;
    logger.warn(`Refund ${rf?.id} is not in the refund ledger (made outside Dawabag?)`); return 'refund not in ledger';
  }
  if (event === 'refund.failed') {
    await query(`UPDATE refunds SET failure_reason = $2 WHERE id = $1 AND status = 'pending'`,
      [leg.id, `Gateway refund failed${rf?.error_description ? `: ${rf.error_description}` : ''}; retry or refund manually`]);
    return 'refund failed at the gateway; waiting for accounts';
  }
  if (event === 'refund.processed' || rf?.status === 'processed') {
    if (leg.status === 'processed') return 'refund already settled';
    await withTransaction((client) => settleGatewayLeg(client, leg.id));
    return 'refund settled';
  }
  return 'refund noted';
}

const MAX_AGE_S = 7 * 24 * 3600;

// The key is the hash of the signed body (Razorpay resends the same bytes); the
// x-razorpay-event-id header is not covered by the signature, so it is not trusted.
export async function handleWebhookEvent(_eventId: string | undefined, rawBody: Buffer, body: any): Promise<{ duplicate: boolean; outcome: string }> {
  const id = `sha256:${crypto.createHash('sha256').update(rawBody).digest('hex').slice(0, 64)}`;
  const createdAt = Number(body?.created_at);
  if (Number.isFinite(createdAt) && Date.now() / 1000 - createdAt > MAX_AGE_S) return { duplicate: true, outcome: 'stale event ignored' };
  const event = String(body?.event || 'unknown');
  const entity = body?.payload?.payment?.entity ?? body?.payload?.refund?.entity ?? body?.payload?.token?.entity ?? {};
  const fresh = await query(
    `INSERT INTO payment_webhook_events (event_id, event, entity_id, order_ref, amount_paise) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (event_id) DO NOTHING RETURNING event_id`,
    [id, event, entity.id ?? null, entity.order_id ?? null, Number.isInteger(entity.amount) ? entity.amount : null]);
  if (!fresh.length) return { duplicate: true, outcome: 'already handled' };
  try {
    let outcome: string;
    switch (event) {
      case 'payment.captured': outcome = (await applyCapture(entity)).outcome; break;
      case 'payment.failed': outcome = await paymentFailed(entity); break;
      case 'refund.processed': case 'refund.failed': case 'refund.created': outcome = await refundEvent(event, entity); break;
      case 'token.confirmed': case 'token.rejected': case 'token.cancelled': case 'token.paused': outcome = await applyTokenEvent(event, entity); break;
      default: outcome = 'ignored';
    }
    await query(`UPDATE payment_webhook_events SET outcome = $2, processed_at = NOW() WHERE event_id = $1`, [id, outcome]);
    return { duplicate: false, outcome };
  } catch (e) {
    await query(`DELETE FROM payment_webhook_events WHERE event_id = $1`, [id]);   // let Razorpay's retry try again
    throw e;
  }
}
