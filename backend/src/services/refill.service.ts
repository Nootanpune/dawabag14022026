// src/services/refill.service.ts
// Refill subscriptions (Sprint 3 task 23, owner decision 2026-09-30):
// reminder a few days ahead (also the pre-debit notice), then the server
// places the order on the refill date; an active mandate is charged
// automatically unless the order needs a prescription check first.
import { query, queryOne, withTransaction } from '../config/database';
import { AppError } from '../utils/AppError';
import { logger } from '../config/logger';
import { writeAudit } from '../utils/audit';
import { effectiveCustomerType, priceField } from '../utils/customerType';
import { queueNotification } from './notification.service';
import { placeOrder } from './orderPlacement.service';
import { chargeOrderOnMandate } from './mandate.service';
import { getSetting } from './settings.service';

export async function createSubscription(userId: string, orderId: string, frequencyDays: number) {
  return withTransaction(async (client) => {
    const o = (await client.query(
      `SELECT id, address_id, status FROM orders WHERE id = $1 AND user_id = $2`, [orderId, userId])).rows[0];
    if (!o) throw new AppError('Order not found', 404);
    if (['cancelled', 'returned', 'payment_failed'].includes(o.status)) throw new AppError('This order cannot be repeated', 400);
    const items = (await client.query(
      `SELECT oi.product_id, SUM(oi.quantity)::int AS quantity FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = $1 AND p.is_active = TRUE AND COALESCE(p.drug_schedule, '') NOT IN ('Schedule X', 'NDPS')
       GROUP BY oi.product_id`, [orderId])).rows;
    if (!items.length) throw new AppError('Nothing in this order can be refilled', 400);
    const sub = (await client.query(
      `INSERT INTO refill_subscriptions (order_id, user_id, address_id, frequency_days, next_refill_date)
       VALUES ($1, $2, $3, $4, CURRENT_DATE + $4::int) RETURNING id, next_refill_date`,
      [orderId, userId, o.address_id, frequencyDays])).rows[0];
    for (const it of items) {
      await client.query(`INSERT INTO refill_items (subscription_id, product_id, quantity) VALUES ($1, $2, $3)`,
        [sub.id, it.product_id, it.quantity]);
    }
    return sub;
  });
}

export async function listSubscriptions(userId: string) {
  return query(
    `SELECT rs.id, rs.order_id, rs.frequency_days, rs.next_refill_date, rs.is_active, rs.auto_charge,
            rs.mandate_id, pm.status AS mandate_status, rs.last_order_id, rs.cancelled_at,
            o.order_number AS source_order_number,
            COALESCE(json_agg(json_build_object('product_id', ri.product_id, 'name', p.name, 'quantity', ri.quantity)
              ORDER BY p.name) FILTER (WHERE ri.product_id IS NOT NULL), '[]') AS items
     FROM refill_subscriptions rs
     JOIN orders o ON o.id = rs.order_id
     LEFT JOIN refill_items ri ON ri.subscription_id = rs.id
     LEFT JOIN products p ON p.id = ri.product_id
     LEFT JOIN payment_mandates pm ON pm.id = rs.mandate_id
     WHERE rs.user_id = $1 AND rs.cancelled_at IS NULL
     GROUP BY rs.id, o.order_number, pm.status
     ORDER BY rs.next_refill_date`, [userId]);
}

export async function updateSubscription(userId: string, id: string, changes: {
  frequency_days?: number; is_active?: boolean; mandate_id?: string | null;
  items?: { product_id: string; quantity: number }[];
}) {
  return withTransaction(async (client) => {
    const sub = (await client.query(
      `SELECT id FROM refill_subscriptions WHERE id = $1 AND user_id = $2 AND cancelled_at IS NULL FOR UPDATE`, [id, userId])).rows[0];
    if (!sub) throw new AppError('Refill not found', 404);
    if (changes.mandate_id) {
      const m = (await client.query(
        `SELECT id FROM payment_mandates WHERE id = $1 AND user_id = $2 AND status = 'active'`, [changes.mandate_id, userId])).rows[0];
      if (!m) throw new AppError('Payment mandate not found or not active', 400);
    }
    if (changes.frequency_days !== undefined) {
      await client.query(`UPDATE refill_subscriptions SET frequency_days = $2 WHERE id = $1`, [id, changes.frequency_days]);
    }
    if (changes.is_active !== undefined) {
      await client.query(`UPDATE refill_subscriptions SET is_active = $2 WHERE id = $1`, [id, changes.is_active]);
    }
    if (changes.mandate_id !== undefined) {
      await client.query(
        `UPDATE refill_subscriptions SET mandate_id = $2::uuid, auto_charge = $2::uuid IS NOT NULL,
           auto_charge_consent_at = CASE WHEN $2::uuid IS NOT NULL THEN NOW() ELSE NULL END WHERE id = $1`,
        [id, changes.mandate_id]);
    }
    if (changes.items) {
      for (const it of changes.items) {
        if (it.quantity === 0) {
          await client.query(`DELETE FROM refill_items WHERE subscription_id = $1 AND product_id = $2`, [id, it.product_id]);
        } else {
          await client.query(
            `UPDATE refill_items SET quantity = $3 WHERE subscription_id = $1 AND product_id = $2`, [id, it.product_id, it.quantity]);
        }
      }
      const left = (await client.query(`SELECT COUNT(*)::int AS n FROM refill_items WHERE subscription_id = $1`, [id])).rows[0].n;
      if (left === 0) throw new AppError('A refill needs at least one item; cancel it instead', 400);
    }
    await client.query(`UPDATE refill_subscriptions SET updated_at = NOW() WHERE id = $1`, [id]);
    return { id };
  });
}

export async function cancelSubscription(userId: string, id: string) {
  const r = await queryOne(
    `UPDATE refill_subscriptions SET is_active = FALSE, cancelled_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND cancelled_at IS NULL RETURNING id`, [id, userId]);
  if (!r) throw new AppError('Refill not found', 404);
  return { id, cancelled: true };
}

// ── Scheduled: reminder / pre-debit notice ───────────────────────────────────
export async function runRefillReminders() {
  const days = Number(await getSetting('refill.reminder_days_before', 3));
  const due = await query<any>(
    `SELECT rs.id, rs.user_id, rs.next_refill_date, rs.mandate_id, pm.status AS mandate_status,
            u.customer_type, u.kyc_status
     FROM refill_subscriptions rs
     JOIN users u ON u.id = rs.user_id
     LEFT JOIN payment_mandates pm ON pm.id = rs.mandate_id
     WHERE rs.is_active AND rs.cancelled_at IS NULL
       AND rs.next_refill_date = CURRENT_DATE + $1::int
       AND rs.reminded_for_date IS DISTINCT FROM rs.next_refill_date`, [days]);
  let sent = 0;
  for (const s of due) {
    const estimate = await estimatePaise(s.id, effectiveCustomerType(s.customer_type, s.kyc_status));
    const claimed = await queryOne(
      `UPDATE refill_subscriptions SET reminded_for_date = next_refill_date
       WHERE id = $1 AND reminded_for_date IS DISTINCT FROM next_refill_date RETURNING id`, [s.id]);
    if (!claimed) continue;
    await queueNotification({
      userId: s.user_id, type: 'refill_upcoming', amountPaise: estimate,
      refillDate: fmt(s.next_refill_date), autoCharge: s.mandate_status === 'active',
    });
    sent++;
  }
  return { reminders_sent: sent };
}

async function estimatePaise(subscriptionId: string, type: ReturnType<typeof effectiveCustomerType>) {
  const col = priceField(type);
  const r = await queryOne<{ total: string }>(
    `SELECT COALESCE(SUM(ri.quantity * COALESCE(p.${col}, p.offer_price_paise) * (100 + p.gst_rate) / 100), 0) AS total
     FROM refill_items ri JOIN products p ON p.id = ri.product_id WHERE ri.subscription_id = $1`, [subscriptionId]);
  return Math.round(Number(r?.total || 0));
}

// ── Scheduled: place due refill orders ───────────────────────────────────────
export async function runDueRefills() {
  const due = await query<any>(
    `SELECT rs.id, rs.user_id, rs.address_id, rs.next_refill_date, rs.frequency_days, rs.mandate_id,
            u.customer_type, u.kyc_status, a.pincode
     FROM refill_subscriptions rs
     JOIN users u ON u.id = rs.user_id AND u.is_active AND u.deleted_at IS NULL
     JOIN addresses a ON a.id = rs.address_id
     WHERE rs.is_active AND rs.cancelled_at IS NULL AND rs.next_refill_date <= CURRENT_DATE`);
  const summary = { ordered: 0, auto_charged: 0, failed: 0 };

  for (const s of due) {
    const forDate = new Date(s.next_refill_date).toISOString().slice(0, 10);
    try {
      const items = await query<{ product_id: string; quantity: number }>(
        `SELECT product_id, quantity FROM refill_items WHERE subscription_id = $1`, [s.id]);
      const order = await placeOrder(
        { id: s.user_id, pricing_type: effectiveCustomerType(s.customer_type, s.kyc_status),
          customer_type: s.customer_type, kyc_status: s.kyc_status },
        { address_id: s.address_id, pincode: s.pincode, items, payment_terms: 'prepaid', wallet_amount_paise: 0 },
        { refill: { subscriptionId: s.id, forDate } });
      summary.ordered++;

      let autoCharged = false;
      if (s.mandate_id && !order.requires_prescription) {
        const r = await chargeOrderOnMandate(order.id, s.mandate_id).catch((err) => {
          logger.error(`Refill auto-charge failed for order ${order.order_number}: ${err.message}`);
          return { charged: false };
        });
        autoCharged = r.charged;
      }
      if (autoCharged) summary.auto_charged++;
      await queueNotification({
        userId: s.user_id, type: 'refill_order_created', orderId: order.id, orderNumber: order.order_number,
        amountPaise: order.total_paise, autoCharged, needsPrescription: order.requires_prescription,
      });
      await query(
        `UPDATE refill_subscriptions SET last_order_id = $2, next_refill_date = next_refill_date + frequency_days,
           updated_at = NOW() WHERE id = $1`, [s.id, order.id]);
    } catch (err) {
      // Duplicate for this date = already ordered (job re-run); anything else: tell the buyer, move on
      if ((err as any).code === '23505') {
        await query(`UPDATE refill_subscriptions SET next_refill_date = next_refill_date + frequency_days WHERE id = $1 AND next_refill_date = $2`, [s.id, forDate]);
        continue;
      }
      summary.failed++;
      const reason = (err as Error).message;
      logger.warn(`Refill ${s.id} failed: ${reason}`);
      await writeAudit({ userId: s.user_id, action: 'refill_failed', newValue: { subscription_id: s.id, for_date: forDate }, notes: reason });
      await queueNotification({ userId: s.user_id, type: 'refill_failed', reason });
      await query(
        `UPDATE refill_subscriptions SET next_refill_date = next_refill_date + frequency_days, updated_at = NOW() WHERE id = $1`, [s.id]);
    }
  }
  return summary;
}

function fmt(d: Date | string): string {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
