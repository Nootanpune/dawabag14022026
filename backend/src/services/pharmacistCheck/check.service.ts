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
import { assertRxCleared, rxRequiredLines } from '../rxGate.service';
import { cancelOrder } from '../cancellation.service';
import { queueNotification } from '../notification.service';
import { captureHeldPaymentQuietly } from '../payments/rxHold/hold.service';
import { assertStaffRegistrationValid } from '../pharmacistRegistration/gate.service';
import { CHECKABLE_ORDER_STATES, CheckDecision, SignalLine, abuseSignals, canDecide, reasonProblem } from './rules';
import { partnerRegistrationAtCheck, staffRegistrationAtCheck } from '../saleIdentity/pharmacist';
import { recordShipmentSaleIdentityTx } from '../saleIdentity/record.service';
import { PRACTITIONER_TYPE } from '../practitionerSales/rules';
import { writtenOrdersFor } from '../practitionerSales/writtenOrder.service';
import { practitionerState } from '../practitionerSales/registration.service';
import { buyerStanding } from '../buyerRestriction/standing.service';
import { buyerMay, restrictedMessage } from '../buyerRestriction/rules';

export const BUYER_NOT_ELIGIBLE = 'BUYER_NOT_ELIGIBLE';

export interface Checker { userId: string; name: string; regNo: string; vendorPharmacistId?: string | null }

/** A Dawabag pharmacist who may release orders: pharmacist_rx with a registration number. */
/**
 * Sprint 48 (security review 41–47 #2): every approval path locks the ORDER row before its
 * shipments — the lock an order change (orderEdit/edit.service), a cancellation and a held
 * capture take first. Before, a release locked only the shipment and could run while the buyer
 * changed the order: it then approved (and invoiced) lines the pharmacist never saw, and a
 * prescription review could release a parcel holding a prescription medicine the buyer had
 * just added without a prescription (C-08, r.64(2)). Same order of locks everywhere → no deadlock.
 */
export async function lockOrderOfShipment(client: PoolClient, shipmentId: string, partnerId?: string): Promise<void> {
  const r = (await client.query(
    `SELECT order_id FROM order_shipments WHERE id = $1${partnerId ? ' AND partner_id = $2' : ''}`,
    partnerId ? [shipmentId, partnerId] : [shipmentId])).rows[0];
  if (r) await client.query(`SELECT 1 FROM orders WHERE id = $1 FOR UPDATE`, [r.order_id]);
}

/** How many times the buyer has changed the order (the check screens send back the number they showed). */
export async function orderEditsCount(db: Pick<PoolClient, 'query'>, orderId: string): Promise<number> {
  return Number((await db.query(`SELECT COUNT(*)::int AS n FROM order_edits WHERE order_id = $1`, [orderId])).rows[0]?.n ?? 0);
}

/**
 * Sprint 48: the pharmacist approves what they looked at. When the check screen says how many
 * changes it showed (`edits_seen`) and the buyer has changed the order since, the approval is
 * refused (409 ORDER_CHANGED) — the pharmacist reopens the order and checks it again.
 */
export async function assertUnchangedSinceShown(client: PoolClient, orderId: string, editsSeen: number | undefined): Promise<void> {
  if (editsSeen === undefined) return;
  if ((await orderEditsCount(client, orderId)) !== editsSeen) {
    throw new AppError('The buyer changed this order after you opened it. Reopen the order and check it again before approving.',
      409, true, 'ORDER_CHANGED');
  }
}

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
  SELECT oi.id AS order_item_id, oi.shipment_id, oi.product_id, oi.product_name, oi.supply_qty AS quantity, oi.removed_qty, p.drug_schedule,
         p.max_qty_per_order, oi.prescription_id,
         (SELECT (iv.content->'facts'->>'habit_forming')::boolean FROM product_info_versions iv
           WHERE iv.product_id = p.id AND iv.status = 'approved' LIMIT 1) AS habit_forming,
         COALESCE((SELECT SUM(o2i.supply_qty) FROM order_items o2i JOIN orders o2 ON o2.id = o2i.order_id
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
            up.full_name AS buyer_name, u.customer_type,
            EXISTS (SELECT 1 FROM order_edits e WHERE e.order_id = o.id AND e.extra_status = 'awaiting_payment') AS extra_payment_pending,
            (SELECT COUNT(*)::int FROM written_orders w WHERE w.order_id = o.id) AS written_orders,
            (SELECT COUNT(*)::int FROM order_edits e WHERE e.order_id = o.id) AS edits_count
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
  // Sprint 44: a doctor / institution order shows its signed written order(s) (r.65(9)(b))
  const written = await writtenOrdersFor(null, orderId);
  const extra = await queryOne<{ n: number }>(`SELECT COUNT(*)::int AS n FROM order_edits WHERE order_id = $1 AND extra_status = 'awaiting_payment'`, [orderId]);
  return { order: o, lines: lines.map((l) => ({ ...lineOut(l), shipment_id: l.shipment_id })), signals: abuseSignals(lines as SignalLine[]), shipments,
    written_orders: written, extra_payment_pending: (extra?.n ?? 0) > 0,
    edits_count: (await queryOne<{ n: number }>(`SELECT COUNT(*)::int AS n FROM order_edits WHERE order_id = $1`, [orderId]))?.n ?? 0 };
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
  if (!shipmentIds.length) return [];
  // Sprint 44: nothing is approved while the buyer still owes the extra for a change, and a
  // doctor / institution order needs its signed written order (r.65(9)(b))
  await assertReleasableTx(client, orderId);
  const registration = JSON.stringify(await registrationAtCheck(client, who));
  const invoices: { shipment_id: string; invoice_number: string }[] = [];
  for (const id of shipmentIds) {
    // Sprint 44: the release issues the tax invoice (trigger order_shipments_issue_invoice, migration 39);
    // the sale record is frozen first, in the same transaction, for the lines as finally supplied
    await recordShipmentSaleIdentityTx(client, id);
    const inv = (await client.query(
      `UPDATE order_shipments SET pharmacist_check = 'released', pharmacist_checked_by = $2, pharmacist_checked_at = NOW(),
         pharmacist_name = $3, pharmacist_reg_no = $4, vendor_pharmacist_id = $5, pharmacist_check_note = NULL,
         pharmacist_registration = $6
       WHERE id = $1 RETURNING invoice_number`, [id, who.userId, who.name, who.regNo, who.vendorPharmacistId ?? null, registration])).rows[0];
    invoices.push({ shipment_id: id, invoice_number: inv?.invoice_number });
    await writeAuditTx(client, { userId: buyerId, action: 'pharmacist_check_released', performedBy: who.userId,
      newValue: { order_id: orderId, shipment_id: id, pharmacist_name: who.name, pharmacist_reg_no: who.regNo,
        vendor_pharmacist_id: who.vendorPharmacistId ?? null, via, invoice_number: inv?.invoice_number ?? null } });
    await writeAuditTx(client, { userId: buyerId, action: 'tax_invoice_issued', performedBy: who.userId,
      newValue: { order_id: orderId, shipment_id: id, invoice_number: inv?.invoice_number ?? null, at: 'pharmacist_release' } });
  }
  return invoices;
}

/**
 * Sprint 44: refuses the approval (409) while an extra payment for an order change is not yet
 * authorised, or when a doctor / institution order has no signed written order.
 */
export async function assertReleasableTx(client: PoolClient, orderId: string) {
  const o = (await client.query(
    `SELECT o.pricing_type,
            EXISTS (SELECT 1 FROM order_edits e WHERE e.order_id = o.id AND e.extra_status = 'awaiting_payment') AS extra_due,
            EXISTS (SELECT 1 FROM written_orders w WHERE w.order_id = o.id) AS written
     FROM orders o WHERE o.id = $1`, [orderId])).rows[0];
  if (o?.extra_due) {
    throw new AppError('The buyer changed this order and has not yet paid the difference. It can be approved once that payment is made.',
      409, true, 'EXTRA_PAYMENT_PENDING');
  }
  if (o?.pricing_type === PRACTITIONER_TYPE && !o.written) {
    throw new AppError('This doctor / institution order has no signed written order attached; it cannot be supplied (Drugs Rules 1945, r.65(9)(b)).',
      409, true, 'WRITTEN_ORDER_REQUIRED');
  }
  await assertBuyerEligibleAtSaleTx(client, orderId);
}

/**
 * Sprint 48 (security review 41–47 #3): since Sprint 44 the sale happens at the pharmacist's
 * approval (the tax invoice is issued then), but the buyer's standing was checked only when the
 * order was placed. A doctor whose registration lapsed or was suspended meanwhile, or a buyer who
 * no longer qualifies for a product restricted to doctors / hospitals or licensed trade
 * (Sprint 47), would still have been invoiced and supplied. Checked again here, on the day of
 * sale: 409 BUYER_NOT_ELIGIBLE — the pharmacist holds or refuses the order (a refusal refunds it).
 * r.65(9)(b); C-14, C-33.
 */
export async function assertBuyerEligibleAtSaleTx(client: PoolClient, orderId: string) {
  const o = (await client.query(
    `SELECT o.user_id, o.pricing_type, u.customer_type, u.kyc_status FROM orders o JOIN users u ON u.id = o.user_id WHERE o.id = $1`,
    [orderId])).rows[0];
  if (!o) return;
  if (o.pricing_type === PRACTITIONER_TYPE) {
    const p = await practitionerState(client, o.user_id);
    if (p.applies && !p.standing!.ok) {
      throw new AppError(`This doctor / institution's registration is not valid today, so the order cannot be approved: ${p.standing!.message}`,
        409, true, BUYER_NOT_ELIGIBLE);
    }
  }
  const restricted = (await client.query(
    `SELECT DISTINCT p.name, p.buyer_restriction FROM order_items oi JOIN order_shipments s ON s.id = oi.shipment_id
     JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id = $1 AND oi.supply_qty > 0 AND s.status <> 'cancelled' AND p.buyer_restriction <> 'everyone'`, [orderId])).rows;
  if (!restricted.length) return;
  const standing = await buyerStanding(client, { id: o.user_id, customer_type: o.customer_type, kyc_status: o.kyc_status });
  const refused = restricted.filter((r: any) => !buyerMay(r.buyer_restriction, standing));
  if (refused.length) {
    throw new AppError(`This buyer may no longer buy ${refused.map((r: any) => r.name).join(', ')} (${restrictedMessage(refused[0].name, refused[0].buyer_restriction, standing.kind)}). `
      + 'Hold the order, or refuse it so the buyer is refunded.', 409, true, BUYER_NOT_ELIGIBLE);
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
  // Sprint 44: an order with prescriptions still to check (e.g. a second one for a medicine the
  // buyer added) is released once every prescription line is covered
  if ((await rxRequiredLines(client, orderId)).some((l) => !l.prescription_id)) return 0;
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
  decision: CheckDecision, reason: string | undefined, actorId: string, opts: { editsSeen?: number } = {},
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
      // Sprint 48: not if the buyer changed the order after the pharmacist opened it
      await assertUnchangedSinceShown(client, s.order_id, opts.editsSeen);
      // A prescription line still waiting blocks the release too (C-08)
      await assertRxCleared(client, s.order_id, s.id);
      const [inv] = await recordRelease(client, [s.id], who, 'order_check', s.user_id, s.order_id);
      return { s, result: { shipment_id: s.id, pharmacist_check: 'released', pharmacist_name: who.name, pharmacist_reg_no: who.regNo,
        invoice_number: inv?.invoice_number ?? null } };
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
export function decideOwnShipment(pharmacistId: string, shipmentId: string, decision: CheckDecision, reason?: string,
  opts: { editsSeen?: number } = {}) {
  return decide(
    async (client) => {
      await lockOrderOfShipment(client, shipmentId);   // Sprint 48: order first, as an order change
      const s = (await client.query(
        `SELECT s.id, s.order_id, s.status, s.pharmacist_check, o.status AS order_status, o.order_number, o.user_id
         FROM order_shipments s JOIN orders o ON o.id = s.order_id
         WHERE s.id = $1 AND s.seller_type = 'dawabag' FOR UPDATE OF s`, [shipmentId])).rows[0];
      if (!s) throw new AppError('Shipment not found', 404);
      assertCheckable(s, 'dawabag');
      return s;
    },
    (client) => dawabagPharmacist(client, pharmacistId),
    decision, reason, pharmacistId, opts);
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
