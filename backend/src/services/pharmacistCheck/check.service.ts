// src/services/pharmacistCheck/check.service.ts — the pharmacist check on every
// order (Sprint 35, owner decision 2026-10-02, Rulebook C-08, audit C-46).
//
// Dawabag's own shipments are released by a Dawabag pharmacist (role pharmacist_rx
// with a registration number). For an order with prescription medicines the
// prescription review releases it (releaseOwnAfterPrescription) — one check, not two.
// Partner shipments are released by the partner's own registered pharmacist
// (partner.service.ts). Packing and dispatch check the release (gate.ts).
import { PoolClient } from 'pg';
import { query, queryOne, withTransaction } from '../../config/database';
import { AppError } from '../../utils/AppError';
import { writeAuditTx } from '../../utils/audit';
import { assertRxCleared } from '../rxGate.service';
import { cancelOrder } from '../cancellation.service';
import { queueNotification } from '../notification.service';
import { captureHeldPaymentQuietly } from '../payments/rxHold/hold.service';
import { assertStaffRegistrationValid } from '../pharmacistRegistration/gate.service';
import { CHECKABLE_ORDER_STATES, CheckDecision, SignalLine, abuseSignals, canDecide, reasonProblem } from './rules';
import { partnerRegistrationAtCheck, staffRegistrationAtCheck } from '../saleIdentity/pharmacist';

export interface Checker { userId: string; name: string; regNo: string; vendorPharmacistId?: string | null }

/** A Dawabag pharmacist who may release orders: pharmacist_rx with a registration number. */
export async function dawabagPharmacist(client: PoolClient, userId: string): Promise<Checker> {
  const p = (await client.query(
    `SELECT u.role, u.pharmacist_reg_no, up.full_name FROM users u
     LEFT JOIN user_profiles up ON up.user_id = u.id WHERE u.id = $1`, [userId])).rows[0];
  if (p?.role !== 'pharmacist_rx') throw new AppError('Only a registered pharmacist can check and release orders', 403);
  if (!p.pharmacist_reg_no) throw new AppError('Add your pharmacy council registration number before checking orders', 403);
  // Sprint 39: only an active, in-date, verified registration may release (C-03, C-08)
  await assertStaffRegistrationValid(client, userId, p.pharmacist_reg_no);
  return { userId, name: p.full_name || 'Pharmacist', regNo: p.pharmacist_reg_no };
}

// Lines of one shipment (or a whole order) with what the pharmacist should look at
const LINES_SQL = `
  SELECT oi.id AS order_item_id, oi.shipment_id, oi.product_id, oi.product_name, oi.quantity, p.drug_schedule,
         p.max_qty_per_order, oi.prescription_id,
         (SELECT (iv.content->'facts'->>'habit_forming')::boolean FROM product_info_versions iv
           WHERE iv.product_id = p.id AND iv.status = 'approved' LIMIT 1) AS habit_forming,
         COALESCE((SELECT SUM(o2i.quantity) FROM order_items o2i JOIN orders o2 ON o2.id = o2i.order_id
                    WHERE o2.user_id = o.user_id AND o2.id <> o.id AND o2i.product_id = oi.product_id
                      AND o2.created_at > NOW() - INTERVAL '30 days'
                      AND o2.status NOT IN ('cancelled', 'payment_failed', 'pending_payment')), 0)::int AS recent_units
  FROM order_items oi JOIN orders o ON o.id = oi.order_id JOIN products p ON p.id = oi.product_id`;

/** Dawabag shipments waiting for the pharmacist (held ones last), with the order's lines. */
export async function checkQueue() {
  const rows = await query<any>(
    `SELECT s.id AS shipment_id, s.invoice_number, s.total_paise, s.cold_chain, s.created_at,
            s.pharmacist_check, s.pharmacist_check_note, s.pharmacist_checked_at,
            o.id AS order_id, o.order_number, o.status AS order_status, o.payment_terms, o.patient_id,
            up.full_name AS buyer_name, u.customer_type
     FROM order_shipments s
     JOIN orders o ON o.id = s.order_id
     JOIN users u ON u.id = o.user_id
     LEFT JOIN user_profiles up ON up.user_id = o.user_id
     WHERE s.seller_type = 'dawabag' AND s.status = 'pending' AND s.pharmacist_check IN ('pending', 'held')
       AND o.status = ANY($1::text[])
     ORDER BY (s.pharmacist_check = 'held'), o.created_at LIMIT 200`, [CHECKABLE_ORDER_STATES]);
  if (!rows.length) return [];
  const lines = await query<any>(`${LINES_SQL} WHERE oi.shipment_id = ANY($1::uuid[]) ORDER BY oi.product_name`,
    [rows.map((r) => r.shipment_id)]);
  return rows.map((r) => {
    const own = lines.filter((l) => l.shipment_id === r.shipment_id);
    return { ...r, lines: own.map(lineOut), signals: abuseSignals(own as SignalLine[]) };
  });
}

const lineOut = (l: any) => ({ order_item_id: l.order_item_id, product_id: l.product_id, product_name: l.product_name,
  quantity: l.quantity, drug_schedule: l.drug_schedule, prescription_verified: !!l.prescription_id });

/** Everything about one order's check: lines + signals, and each shipment's check state. */
export async function orderCheckDetail(orderId: string) {
  const o = await queryOne<any>(
    `SELECT o.id, o.order_number, o.status, o.payment_terms, o.created_at, up.full_name AS buyer_name, u.customer_type
     FROM orders o JOIN users u ON u.id = o.user_id LEFT JOIN user_profiles up ON up.user_id = o.user_id WHERE o.id = $1`, [orderId]);
  if (!o) throw new AppError('Order not found', 404);
  const lines = await query<any>(`${LINES_SQL} WHERE oi.order_id = $1 ORDER BY oi.product_name`, [orderId]);
  const shipments = await query<any>(
    `SELECT s.id, s.seller_type, COALESCE(v.name, 'Dawabag') AS seller_name, s.status, s.pharmacist_check,
            s.pharmacist_check_note, s.pharmacist_name, s.pharmacist_reg_no, s.pharmacist_checked_at
     FROM order_shipments s LEFT JOIN vendors v ON v.id = s.partner_id WHERE s.order_id = $1 ORDER BY s.seller_type, v.name`, [orderId]);
  return { order: o, lines: lines.map((l) => ({ ...lineOut(l), shipment_id: l.shipment_id })), signals: abuseSignals(lines as SignalLine[]), shipments };
}

/** Sprint 42: the checker's registration as at this check — kept on the shipment, filled once (C-03, C-08). */
const registrationAtCheck = (client: PoolClient, who: Checker) => (who.vendorPharmacistId
  ? partnerRegistrationAtCheck(client, who.vendorPharmacistId, who.regNo)
  : staffRegistrationAtCheck(client, who.userId, who.regNo));

/**
 * Record a release on locked shipment rows and write the trail (C-46). The release (or a
 * refusal) is final: the pharmacist of record and their registration cannot be changed
 * afterwards (trigger order_shipments_identity_final, Sprint 42).
 */
export async function recordRelease(client: PoolClient, shipmentIds: string[], who: Checker, via: string, buyerId: string, orderId: string) {
  const registration = shipmentIds.length ? JSON.stringify(await registrationAtCheck(client, who)) : null;
  for (const id of shipmentIds) {
    await client.query(
      `UPDATE order_shipments SET pharmacist_check = 'released', pharmacist_checked_by = $2, pharmacist_checked_at = NOW(),
         pharmacist_name = $3, pharmacist_reg_no = $4, vendor_pharmacist_id = $5, pharmacist_check_note = NULL,
         pharmacist_registration = $6
       WHERE id = $1`, [id, who.userId, who.name, who.regNo, who.vendorPharmacistId ?? null, registration]);
    await writeAuditTx(client, { userId: buyerId, action: 'pharmacist_check_released', performedBy: who.userId,
      newValue: { order_id: orderId, shipment_id: id, pharmacist_name: who.name, pharmacist_reg_no: who.regNo,
        vendor_pharmacist_id: who.vendorPharmacistId ?? null, via } });
  }
}

/**
 * The prescription review is the pharmacist check for Dawabag's own part of the order:
 * once no prescription line is waiting, the same pharmacist's verification releases
 * Dawabag's shipments (called inside rxVerification's transaction).
 */
export async function releaseOwnAfterPrescription(client: PoolClient, orderId: string, pharmacistId: string): Promise<number> {
  const who = await dawabagPharmacist(client, pharmacistId);
  const o = (await client.query(`SELECT user_id, status FROM orders WHERE id = $1`, [orderId])).rows[0];
  if (!o || !CHECKABLE_ORDER_STATES.includes(o.status)) return 0;
  const ids = (await client.query(
    `SELECT id FROM order_shipments WHERE order_id = $1 AND seller_type = 'dawabag' AND status = 'pending'
       AND pharmacist_check IN ('pending', 'held') FOR UPDATE`, [orderId])).rows.map((r: any) => r.id);
  await recordRelease(client, ids, who, 'prescription_review', o.user_id, orderId);
  return ids.length;
}

interface Locked { id: string; order_id: string; pharmacist_check: string; order_status: string; order_number: string; user_id: string }

/**
 * Release / hold / reject one shipment. `lock` finds and locks it for this checker
 * (Dawabag or partner); `who` names the pharmacist. A refusal cancels the whole order
 * and refunds what was paid (cancellation.service, C-37).
 */
export async function decide(
  lock: (client: PoolClient) => Promise<Locked>, resolveChecker: (client: PoolClient) => Promise<Checker>,
  decision: CheckDecision, reason: string | undefined, actorId: string,
) {
  const problem = reasonProblem(decision, reason);
  if (problem) throw new AppError(problem, 400);
  const note = reason?.trim();
  if (decision === 'reject') {
    const pre = await withTransaction(async (client) => {
      const s = await lock(client);
      if (!canDecide(s.pharmacist_check, decision)) throw new AppError(`Already ${s.pharmacist_check.replace('_', ' ')}`, 409);
      return { s, who: await resolveChecker(client) };
    });
    // Cancels every shipment of the order and refunds it (C-37); refused if any part has left.
    // orders.cancellation_reason is shown to the BUYER (web and app): it carries only this
    // refusal reason, which the dialogs label as shown to the buyer — never the staff-only
    // hold note (pharmacist_check_note of an earlier hold is not copied here).
    const cancelled = await cancelOrder(pre.s.order_id, { id: actorId, staff: true }, `Not supplied after the pharmacist's check: ${note}`);
    await withTransaction(async (client) => {
      await client.query(
        `UPDATE order_shipments SET pharmacist_check = 'rejected', pharmacist_checked_by = $2, pharmacist_checked_at = NOW(),
           pharmacist_name = $3, pharmacist_reg_no = $4, vendor_pharmacist_id = $5, pharmacist_check_note = $6,
           pharmacist_registration = $7 WHERE id = $1`,
        [pre.s.id, pre.who.userId, pre.who.name, pre.who.regNo, pre.who.vendorPharmacistId ?? null, note,
         JSON.stringify(await registrationAtCheck(client, pre.who))]);
      await writeAuditTx(client, { userId: pre.s.user_id, action: 'pharmacist_check_rejected', performedBy: actorId,
        newValue: { order_id: pre.s.order_id, shipment_id: pre.s.id, pharmacist_name: pre.who.name, pharmacist_reg_no: pre.who.regNo,
          refund_paise: cancelled.refund_paise }, notes: note });
    });
    return { shipment_id: pre.s.id, pharmacist_check: 'rejected', order_status: 'cancelled', refund_paise: cancelled.refund_paise };
  }

  const out = await withTransaction(async (client) => {
    const s = await lock(client);
    if (!canDecide(s.pharmacist_check, decision)) throw new AppError(`Already ${s.pharmacist_check.replace('_', ' ')}`, 409);
    const who = await resolveChecker(client);
    if (decision === 'release') {
      // A prescription line still waiting blocks the release too (C-08)
      await assertRxCleared(client, s.order_id, s.id);
      await recordRelease(client, [s.id], who, 'order_check', s.user_id, s.order_id);
      return { s, result: { shipment_id: s.id, pharmacist_check: 'released', pharmacist_name: who.name, pharmacist_reg_no: who.regNo } };
    }
    await client.query(
      `UPDATE order_shipments SET pharmacist_check = 'held', pharmacist_checked_by = $2, pharmacist_checked_at = NOW(),
         pharmacist_name = $3, pharmacist_reg_no = $4, vendor_pharmacist_id = $5, pharmacist_check_note = $6 WHERE id = $1`,
      [s.id, who.userId, who.name, who.regNo, who.vendorPharmacistId ?? null, note]);
    await writeAuditTx(client, { userId: s.user_id, action: 'pharmacist_check_held', performedBy: actorId,
      newValue: { order_id: s.order_id, shipment_id: s.id, pharmacist_name: who.name, pharmacist_reg_no: who.regNo }, notes: note });
    return { s, result: { shipment_id: s.id, pharmacist_check: 'held' } };
  });
  if (decision === 'hold') {
    await queueNotification({ userId: out.s.user_id, type: 'order_on_hold', orderId: out.s.order_id, orderNumber: out.s.order_number });
    return out.result;
  }
  // Sprint 39: the last prescription part released → the held payment is captured (C-37)
  return { ...out.result, payment: await captureHeldPaymentQuietly(out.s.order_id, actorId) };
}

/** Dawabag's own shipment, checked by a Dawabag pharmacist. */
export function decideOwnShipment(pharmacistId: string, shipmentId: string, decision: CheckDecision, reason?: string) {
  return decide(
    async (client) => {
      const s = (await client.query(
        `SELECT s.id, s.order_id, s.status, s.pharmacist_check, o.status AS order_status, o.order_number, o.user_id
         FROM order_shipments s JOIN orders o ON o.id = s.order_id
         WHERE s.id = $1 AND s.seller_type = 'dawabag' FOR UPDATE OF s`, [shipmentId])).rows[0];
      if (!s) throw new AppError('Shipment not found', 404);
      assertCheckable(s, 'dawabag');
      return s;
    },
    (client) => dawabagPharmacist(client, pharmacistId),
    decision, reason, pharmacistId);
}

/** Shared state checks before any decision. */
export function assertCheckable(s: { status: string; order_status: string }, who: 'dawabag' | 'partner') {
  if (s.status !== 'pending') throw new AppError(`This shipment is already ${s.status}`, 409);
  if (s.order_status === 'rx_pending' || s.order_status === 'rx_rejected') {
    throw new AppError(who === 'partner'
      ? "Waiting for Dawabag's pharmacist to verify the prescription for this order; check it after that"
      : 'This order is waiting for its prescription; review the prescription in the Prescriptions list (that review is the check)', 409);
  }
  if (!CHECKABLE_ORDER_STATES.includes(s.order_status)) {
    throw new AppError(`Order is ${s.order_status.replace(/_/g, ' ')}; it cannot be checked now`, 409);
  }
}
