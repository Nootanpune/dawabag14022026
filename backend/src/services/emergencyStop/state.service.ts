// The emergency-stop switch (rules.ts): stored as the server setting `sales.rx_pause`
// (database is the only authority, read on every use — never cached), changed only
// here, by a super-admin, in one transaction with its audit entry (C-46).
import { PoolClient } from 'pg';
import { query, withTransaction } from '../../config/database';
import { AppError } from '../../utils/AppError';
import { writeAuditTx } from '../../utils/audit';
import { BuyerType, effectiveCustomerType } from '../../utils/customerType';
import { getSetting } from '../settings.service';
import { RxPauseState, checkoutMessage, dispatchHeldMessage, isPausedLine, parsePauseState } from './rules';

const KEY = 'sales.rx_pause';
type Q = Pick<PoolClient, 'query'>;

export async function getRxPause(db?: Q): Promise<RxPauseState> {
  return parsePauseState(await getSetting<unknown>(KEY, { paused: false }, db));
}

export interface PauseInput { reason: string; reference: string; public_message?: string | null }

export async function pauseRxSales(actorId: string, input: PauseInput, ip?: string | null) {
  return withTransaction(async (c) => {
    const before = parsePauseState((await c.query(`SELECT value FROM app_settings WHERE key = $1 FOR UPDATE`, [KEY])).rows[0]?.value);
    if (before.paused) throw new AppError('Prescription-medicine sales are already paused', 409);
    const state: RxPauseState = {
      paused: true, reason: input.reason, reference: input.reference, public_message: input.public_message || null,
      paused_by: actorId, paused_at: new Date().toISOString(),
    };
    await c.query(
      `INSERT INTO app_settings (key, value, description, updated_by, updated_at) VALUES ($1, $2, 'Emergency stop for prescription-medicine sales', $3, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
      [KEY, JSON.stringify(state), actorId]);
    await writeAuditTx(c, { userId: null, action: 'rx_sales_paused', performedBy: actorId, ip: ip ?? null,
      newValue: { reason: input.reason, reference: input.reference, public_message: state.public_message } });
    return state;
  });
}

export async function resumeRxSales(actorId: string, note: string | undefined, ip?: string | null) {
  return withTransaction(async (c) => {
    const before = parsePauseState((await c.query(`SELECT value FROM app_settings WHERE key = $1 FOR UPDATE`, [KEY])).rows[0]?.value);
    if (!before.paused) throw new AppError('Prescription-medicine sales are not paused', 409);
    await c.query(`UPDATE app_settings SET value = '{"paused": false}', updated_by = $2, updated_at = NOW() WHERE key = $1`, [KEY, actorId]);
    await writeAuditTx(c, { userId: null, action: 'rx_sales_resumed', performedBy: actorId, ip: ip ?? null, notes: note ?? null,
      oldValue: { reason: before.reason, reference: before.reference, paused_by: before.paused_by, paused_at: before.paused_at } });
    return { paused: false } as RxPauseState;
  });
}

/** Pause and resume history, newest first, from the audit log. */
export function pauseHistory(limit = 20) {
  return query<any>(
    `SELECT a.action, a.created_at, a.old_value, a.new_value, a.notes, up.full_name AS by_name
     FROM audit_logs a LEFT JOIN user_profiles up ON up.user_id = a.performed_by
     WHERE a.action IN ('rx_sales_paused', 'rx_sales_resumed') ORDER BY a.created_at DESC LIMIT $1`, [limit]);
}

// ── Checks used by cart, checkout, payment and dispatch ──────────────────────

export const pausedError = (message: string) => new AppError(message, 409, true, 'RX_SALES_PAUSED');

/** Checkout / payment: refuse while paused if any line needs a prescription for this buyer. */
export async function assertRxSalesOpen(db: Q, buyer: BuyerType, lines: { name: string; drug_schedule: string | null }[]) {
  const state = await getRxPause(db);
  const held = lines.filter((l) => isPausedLine(state, buyer, l.drug_schedule)).map((l) => l.name);
  if (held.length) throw pausedError(checkoutMessage(state, held));
}

/** Same check for an order already placed (paying for it later). */
export async function assertOrderPayable(db: Q, orderId: string) {
  const state = await getRxPause(db);
  if (!state.paused) return;
  const rows = (await db.query(
    `SELECT oi.product_name AS name, p.drug_schedule, u.customer_type, u.kyc_status
     FROM order_items oi JOIN products p ON p.id = oi.product_id JOIN orders o ON o.id = oi.order_id JOIN users u ON u.id = o.user_id
     WHERE oi.order_id = $1`, [orderId])).rows;
  if (!rows.length) return;
  await assertRxSalesOpen(db, effectiveCustomerType(rows[0].customer_type, rows[0].kyc_status), rows);
}

/** Dispatch (Dawabag or partner): a parcel holding a paused line is held. */
export async function assertDispatchAllowed(db: Q, shipmentId: string) {
  const state = await getRxPause(db);
  if (!state.paused) return;
  const rows = (await db.query(
    `SELECT oi.product_name AS name, p.drug_schedule, u.customer_type, u.kyc_status
     FROM order_items oi JOIN products p ON p.id = oi.product_id JOIN orders o ON o.id = oi.order_id JOIN users u ON u.id = o.user_id
     WHERE oi.shipment_id = $1`, [shipmentId])).rows;
  if (!rows.length) return;
  const buyer = effectiveCustomerType(rows[0].customer_type, rows[0].kyc_status);
  const held = rows.filter((l: any) => isPausedLine(state, buyer, l.drug_schedule)).map((l: any) => l.name);
  if (held.length) throw pausedError(dispatchHeldMessage(state, held));
}
