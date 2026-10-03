// Reconciliation with Razorpay.
// 1. Sweep (job payment_reconcile): payments and consultation fees still open
//    10 minutes after checkout are looked up at the gateway — a payment whose
//    app confirmation and webhook were both lost is recorded all the same.
// 2. Settlement report for the CA: the gateway's settlement lines for each day,
//    matched to Dawabag's payments and refunds. Fetched live, never stored.
import { query } from '../../config/database';
import { logger } from '../../config/logger';
import { AppError } from '../../utils/AppError';
import { getRazorpay, razorpayConfigured } from '../razorpay.client';
import { applyCapture } from './capture.service';
import { recordAuthorisation } from './rxHold/hold.service';
import { retryPendingConsultationRefunds } from '../telemedicine/consultationFee.service';

export async function runPaymentSweep(): Promise<Record<string, unknown>> {
  if (!razorpayConfigured()) return { skipped: 'Razorpay not configured' };
  const open = await query<{ gateway_order_id: string }>(
    `SELECT gateway_order_id FROM payments WHERE status IN ('created', 'failed') AND gateway_order_id IS NOT NULL AND gateway <> 'demo'
       AND created_at BETWEEN NOW() - INTERVAL '3 days' AND NOW() - INTERVAL '10 minutes'
     UNION SELECT gateway_order_id FROM consultations WHERE payment_status = 'unpaid' AND gateway_order_id IS NOT NULL AND gateway_order_id NOT LIKE 'demo\_%'
       AND status = 'booked' AND created_at BETWEEN NOW() - INTERVAL '3 days' AND NOW() - INTERVAL '10 minutes'
     LIMIT 200`);
  let recorded = 0;
  for (const o of open) {
    try {
      const list: any = await getRazorpay().orders.fetchPayments(o.gateway_order_id);
      let p = (list.items ?? []).find((x: any) => x.status === 'captured') ?? (list.items ?? []).find((x: any) => x.status === 'authorized');
      if (!p) continue;
      // Sprint 39: a prescription order's authorisation is recorded, not captured (that waits for the pharmacist)
      if (p.status === 'authorized') {
        const held = await recordAuthorisation(p);
        if (held) { if (!/already/.test(held.outcome)) recorded++; continue; }
        p = await getRazorpay().payments.capture(p.id, Number(p.amount), 'INR');
      }
      const r = await applyCapture(p);
      if (!/already/.test(r.outcome)) recorded++;
    } catch (e: any) {
      logger.error(`Payment sweep ${o.gateway_order_id}: ${e?.error?.description || e?.message || e}`);
    }
  }
  const refunded = await retryPendingConsultationRefunds();
  return { checked: open.length, recorded, consultation_refunds_sent: refunded };
}

function days(from: string, to: string): Date[] {
  const out: Date[] = [];
  for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d = new Date(d.getTime() + 864e5)) out.push(d);
  return out;
}

export async function settlementReconciliation({ from, to }: { from: string; to: string }) {
  if (!razorpayConfigured()) throw new AppError('Razorpay is not configured', 503);
  const span = days(from, to);
  if (span.length > 31) throw new AppError('Choose up to 31 days for the settlement reconciliation', 400);
  const lines: any[] = [];
  for (const d of span) {
    for (let skip = 0; ; skip += 1000) {
      const page: any = await (getRazorpay() as any).settlements.reports({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), count: 1000, skip });
      lines.push(...(page.items ?? []));
      if ((page.items ?? []).length < 1000) break;
    }
  }
  const payIds = lines.filter((l) => l.type === 'payment').map((l) => l.entity_id);
  const refIds = lines.filter((l) => l.type === 'refund').map((l) => l.entity_id);
  const ours = new Map<string, { ref: string; amount: number }>();
  for (const r of await query<any>(
    `SELECT p.gateway_payment_id AS id, o.order_number AS ref, p.amount_paise AS amount FROM payments p JOIN orders o ON o.id = p.order_id WHERE p.gateway_payment_id = ANY($1)
     UNION ALL SELECT gateway_payment_id, 'Consultation ' || LEFT(id::text, 8), fee_paise FROM consultations WHERE gateway_payment_id = ANY($1)
     UNION ALL SELECT r.gateway_refund_id, o.order_number, r.amount_paise FROM refunds r JOIN orders o ON o.id = r.order_id WHERE r.gateway_refund_id = ANY($2)
     UNION ALL SELECT gateway_refund_id, 'Consultation ' || LEFT(id::text, 8), fee_paise FROM consultations WHERE gateway_refund_id = ANY($2)`,
    [payIds, refIds])) ours.set(r.id, { ref: r.ref, amount: Number(r.amount) });
  const rows = lines.map((l) => {
    const mine = ours.get(l.entity_id);
    const amount = Number(l.amount);
    return {
      settled_on: l.settled_at ? new Date(Number(l.settled_at) * 1000).toISOString().slice(0, 10) : null,
      type: l.type, gateway_id: l.entity_id, dawabag_ref: mine?.ref ?? null,
      gateway_amount_paise: amount, dawabag_amount_paise: mine?.amount ?? null,
      fee_paise: Number(l.fee ?? 0), tax_paise: Number(l.tax ?? 0), net_paise: Number(l.credit ?? 0) - Number(l.debit ?? 0),
      settlement_utr: l.settlement_utr ?? null,
      status: !mine ? 'missing_in_dawabag' : mine.amount !== amount ? 'amount_mismatch' : 'matched',
    };
  });
  // Captured in the period at Dawabag but not in any settlement line fetched
  const seen = new Set(payIds);
  const unsettled = await query<any>(
    `SELECT p.gateway_payment_id, o.order_number, p.amount_paise, p.paid_at FROM payments p JOIN orders o ON o.id = p.order_id
     WHERE p.status IN ('captured', 'partially_refunded', 'refunded') AND p.gateway_payment_id IS NOT NULL
       AND (p.paid_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $1 AND $2`, [from, to]);
  for (const u of unsettled) {
    if (seen.has(u.gateway_payment_id)) continue;
    rows.push({ settled_on: null, type: 'payment', gateway_id: u.gateway_payment_id, dawabag_ref: u.order_number, gateway_amount_paise: null as any,
      dawabag_amount_paise: Number(u.amount_paise), fee_paise: 0, tax_paise: 0, net_paise: 0, settlement_utr: null, status: 'not_yet_settled' });
  }
  return rows;
}
