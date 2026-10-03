// The money side of an order change before the invoice (Sprint 44; rules.ts moneyAction).
// The order is re-priced from its lines; the difference against what the buyer has paid is
// refunded through the refund ledger (C-37), collected by a second payment, or put on / taken
// off a trade buyer's credit bill.
import { PoolClient } from 'pg';
import { AppError } from '../../utils/AppError';
import { repricedDiscount } from './rules';

export interface OrderMoneyRow {
  id: string;
  payment_terms: string;
  subtotal_paise: number;
  gst_paise: number;
  discount_paise: number;
  shipping_paise: number;
  wallet_used_paise: number;
  total_paise: number;
  placed_subtotal_paise: number | null;
  placed_gst_paise: number | null;
  placed_discount_paise: number | null;
  credit_settled_at: string | null;
  user_id: string;
}

/** What the buyer has paid towards the order (prepaid): payments taken or held + wallet, less refunds made or promised. */
export async function committedPaise(client: PoolClient, o: OrderMoneyRow): Promise<number> {
  if (o.payment_terms !== 'prepaid') return Number(o.total_paise) + Number(o.wallet_used_paise);
  const r = (await client.query(
    `SELECT COALESCE((SELECT SUM(amount_paise) FROM payments WHERE order_id = $1
                        AND status IN ('authorized', 'captured', 'partially_refunded', 'refunded')), 0)::bigint AS paid,
            COALESCE((SELECT SUM(amount_paise) FROM refunds WHERE order_id = $1 AND status <> 'failed'), 0)::bigint AS refunded,
            COALESCE((SELECT SUM(refund_paise) FROM order_edits WHERE order_id = $1 AND refund_status = 'after_capture'), 0)::bigint AS promised`,
    [o.id])).rows[0];
  return Number(r.paid) + Number(o.wallet_used_paise) - Number(r.refunded) - Number(r.promised);
}

/** The order's value now (goods + delivery − discount, before wallet) and the amounts to store. */
export async function repriceOrderTx(client: PoolClient, o: OrderMoneyRow) {
  const t = (await client.query(
    `SELECT COALESCE(SUM(oi.unit_price_paise * oi.supply_qty), 0)::bigint AS subtotal, COALESCE(SUM(oi.gst_amount_paise), 0)::bigint AS gst
     FROM order_items oi JOIN order_shipments s ON s.id = oi.shipment_id
     WHERE oi.order_id = $1 AND s.status <> 'cancelled'`, [o.id])).rows[0];
  const subtotal = Number(t.subtotal), gst = Number(t.gst);
  const placedGoods = Number(o.placed_subtotal_paise ?? o.subtotal_paise) + Number(o.placed_gst_paise ?? o.gst_paise);
  const discount = repricedDiscount(Number(o.placed_discount_paise ?? o.discount_paise), placedGoods, subtotal + gst);
  const value = subtotal + gst + Number(o.shipping_paise) - discount;
  return { subtotal, gst, discount, value };
}

/** The order's value before the change (as stored). */
export const valueOf = (o: OrderMoneyRow) => Number(o.subtotal_paise) + Number(o.gst_paise) + Number(o.shipping_paise) - Number(o.discount_paise);

/** A trade buyer's credit bill grows or shrinks with the change (credit limit checked on growth). */
export async function adjustCreditBillTx(client: PoolClient, o: OrderMoneyRow, delta: number) {
  if (delta > 0 && o.payment_terms !== 'cad') {
    const c = (await client.query(`SELECT credit_limit_paise, credit_used_paise FROM users WHERE id = $1 FOR UPDATE`, [o.user_id])).rows[0];
    if (Number(c.credit_used_paise) + delta > Number(c.credit_limit_paise)) {
      throw new AppError(`This change exceeds your credit limit. Available: ₹${Math.round((Number(c.credit_limit_paise) - Number(c.credit_used_paise)) / 100)}`,
        400, true, 'CREDIT_LIMIT_EXCEEDED');
    }
  }
  if (o.payment_terms !== 'cad') {
    await client.query(`UPDATE users SET credit_used_paise = GREATEST(credit_used_paise + $2, 0) WHERE id = $1`, [o.user_id, delta]);
  }
}
