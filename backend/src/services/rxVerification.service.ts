// src/services/rxVerification.service.ts
// Pharmacist review of a prescription against an order (Rulebook C-03, C-08).
// Only a pharmacist_rx login with a pharmacy-council registration number may
// decide. Verification records prescriber and patient, what the prescription
// allows per product, and dispenses the order's quantities against it — the
// same prescription can later cover a refill up to what remains.
import { PoolClient } from 'pg';
import { withTransaction } from '../config/database';
import { AppError } from '../utils/AppError';
import { writeAuditTx } from '../utils/audit';
import { queueNotification } from './notification.service';
import { rxRequiredLines } from './rxGate.service';
import { releaseOwnAfterPrescription } from './pharmacistCheck/check.service';
import { captureHeldPaymentQuietly } from './payments/rxHold/hold.service';
import { assertStaffRegistrationValid } from './pharmacistRegistration/gate.service';

export interface VerifyInput {
  prescriber_name: string;
  prescriber_reg_no: string;
  prescriber_address: string;     // Sprint 38: needed for the Schedule H1 register (C-09)
  prescribed_on: string;          // YYYY-MM-DD
  patient_name: string;
  valid_days: number;             // from prescribed_on
  items: { product_id: string; prescribed_qty: number }[];
  notes?: string;
}

const MAX_RX_AGE_DAYS = 180;

async function pharmacist(client: PoolClient, userId: string) {
  const p = (await client.query(
    `SELECT u.role, u.pharmacist_reg_no, up.full_name FROM users u
     LEFT JOIN user_profiles up ON up.user_id = u.id WHERE u.id = $1`, [userId])).rows[0];
  if (p?.role !== 'pharmacist_rx') throw new AppError('Only a registered pharmacist can review prescriptions', 403);
  if (!p.pharmacist_reg_no) throw new AppError('Add your pharmacy council registration number before reviewing prescriptions', 403);
  // Sprint 39: a lapsed, expired, suspended or unverified registration blocks the review (C-03, C-08)
  await assertStaffRegistrationValid(client, userId, p.pharmacist_reg_no);
  return p;
}

// Dispense the order's prescription lines against the prescription; throws if
// a line is not covered or would exceed what was prescribed. Sprint 38: each line is
// an append-only row in rx_dispense_ledger (the database re-checks the balance under a
// lock and moves retain_until to N years after this dispense; C-08, C-34).
async function dispenseAgainst(client: PoolClient, prescriptionId: string, orderId: string, pharmacistId: string) {
  const lines = (await rxRequiredLines(client, orderId)).filter((l) => !l.prescription_id);
  if (!lines.length) throw new AppError('This order has no prescription lines waiting for review', 400);
  for (const l of lines) {
    // Lock the line first, then read its balance (the ledger trigger takes the same lock)
    const item = (await client.query(
      `SELECT 1 FROM prescription_items WHERE prescription_id = $1 AND product_id = $2 FOR UPDATE`, [prescriptionId, l.product_id])).rows[0];
    if (!item) throw new AppError(`${l.product_name} is not on this prescription`, 400);
    const bal = (await client.query(
      `SELECT remaining_qty FROM prescription_item_balances WHERE prescription_id = $1 AND product_id = $2`, [prescriptionId, l.product_id])).rows[0];
    if (l.quantity > bal.remaining_qty) {
      throw new AppError(`${l.product_name}: ${l.quantity} ordered but only ${bal.remaining_qty} left on the prescription`, 400);
    }
    await client.query(
      `INSERT INTO rx_dispense_ledger (prescription_id, product_id, kind, quantity, order_id, order_item_id, recorded_by)
       VALUES ($1, $2, 'dispense', $3, $4, $5, $6)`,
      [prescriptionId, l.product_id, l.quantity, orderId, l.order_item_id, pharmacistId]);
    await client.query(`UPDATE order_items SET prescription_id = $2 WHERE id = $1`, [l.order_item_id, prescriptionId]);
  }
  await client.query(
    `UPDATE orders SET status = 'rx_verified', updated_at = NOW() WHERE id = $1 AND status = 'rx_pending'`, [orderId]);
  return lines.length;
}

export async function verifyPrescription(pharmacistId: string, prescriptionId: string, input: VerifyInput) {
  const r = await verifyPrescriptionTx(pharmacistId, prescriptionId, input);
  // Sprint 39: a prescription order's held payment is captured once the check has passed (C-37)
  return { ...r, payment: await captureHeldPaymentQuietly(r.order_id, pharmacistId) };
}

function verifyPrescriptionTx(pharmacistId: string, prescriptionId: string, input: VerifyInput) {
  return withTransaction(async (client) => {
    const ph = await pharmacist(client, pharmacistId);
    const rx = (await client.query(`SELECT * FROM prescriptions WHERE id = $1 FOR UPDATE`, [prescriptionId])).rows[0];
    if (!rx) throw new AppError('Prescription not found', 404);
    if (rx.status !== 'pending') throw new AppError(`Prescription is already ${rx.status}`, 409);
    if (!rx.order_id) throw new AppError('Prescription is not attached to an order', 400);

    const prescribedOn = new Date(input.prescribed_on);
    const ageDays = (Date.now() - prescribedOn.getTime()) / 864e5;
    if (ageDays < -1) throw new AppError('Prescription date is in the future', 400);
    if (ageDays > MAX_RX_AGE_DAYS) throw new AppError(`Prescription is older than ${MAX_RX_AGE_DAYS} days`, 400);
    let validUntil = new Date(prescribedOn.getTime() + input.valid_days * 864e5).toISOString().slice(0, 10);
    // A Dawabag e-prescription: never longer than the doctor wrote it for, never other medicines
    if (rx.digital_prescription_id) {
      const ep = (await client.query(`SELECT valid_until FROM digital_prescriptions WHERE id = $1`, [rx.digital_prescription_id])).rows[0];
      const allowed = new Set((await client.query(`SELECT product_id FROM digital_prescription_items WHERE prescription_id = $1`, [rx.digital_prescription_id])).rows.map((r: any) => r.product_id));
      const epUntil = new Date(ep.valid_until).toISOString().slice(0, 10);
      if (validUntil > epUntil) validUntil = epUntil;
      const extra = input.items.filter((it) => !allowed.has(it.product_id));
      if (extra.length) throw new AppError('Only medicines on the doctor\'s e-prescription can be entered', 400);
    }

    // What it allows is written while it is still pending: once verified, the database
    // freezes the prescription and its medicines (Sprint 38, C-08)
    for (const it of input.items) {
      await client.query(
        `INSERT INTO prescription_items (prescription_id, product_id, prescribed_qty) VALUES ($1, $2, $3)
         ON CONFLICT (prescription_id, product_id) DO UPDATE SET prescribed_qty = EXCLUDED.prescribed_qty`,
        [prescriptionId, it.product_id, it.prescribed_qty]);
    }
    await client.query(
      `UPDATE prescriptions SET status = 'verified', verified_by = $2, verified_at = NOW(), valid_until = $3,
         prescriber_name = $4, prescriber_reg_no = $5, prescribed_on = $6, patient_name = $7,
         pharmacist_reg_no = $8, doctor_name = $4, prescriber_address = $9,
         retain_until = (CURRENT_DATE + make_interval(years => dawabag_prescription_retain_years()))::date
       WHERE id = $1`,
      [prescriptionId, pharmacistId, validUntil, input.prescriber_name, input.prescriber_reg_no,
       input.prescribed_on, input.patient_name, ph.pharmacist_reg_no, input.prescriber_address]);
    const covered = await dispenseAgainst(client, prescriptionId, rx.order_id, pharmacistId);
    await writeAuditTx(client, { userId: rx.user_id, action: 'prescription_verified', performedBy: pharmacistId,
      newValue: { prescription_id: prescriptionId, order_id: rx.order_id, lines_covered: covered, valid_until: validUntil },
      notes: input.notes });
    // The prescription review is the pharmacist check of Dawabag's own part of the
    // order: one step, not two (Sprint 35, C-08). Partner parts wait for their pharmacist.
    const released = await releaseOwnAfterPrescription(client, rx.order_id, pharmacistId);
    await notifyBuyer(client, rx.order_id, 'rx_verified');
    return { prescription_id: prescriptionId, order_id: rx.order_id, lines_covered: covered, valid_until: validUntil, shipments_released: released };
  });
}

export async function rejectPrescription(pharmacistId: string, prescriptionId: string, reason: string) {
  return withTransaction(async (client) => {
    await pharmacist(client, pharmacistId);
    const rx = (await client.query(`SELECT * FROM prescriptions WHERE id = $1 FOR UPDATE`, [prescriptionId])).rows[0];
    if (!rx) throw new AppError('Prescription not found', 404);
    if (rx.status !== 'pending') throw new AppError(`Prescription is already ${rx.status}`, 409);
    await client.query(
      `UPDATE prescriptions SET status = 'rejected', verified_by = $2, verified_at = NOW(), rejection_reason = $3,
         retain_until = (CURRENT_DATE + make_interval(years => dawabag_prescription_retain_years()))::date WHERE id = $1`,
      [prescriptionId, pharmacistId, reason]);
    if (rx.order_id) {
      await client.query(`UPDATE orders SET status = 'rx_rejected', updated_at = NOW() WHERE id = $1 AND status = 'rx_pending'`, [rx.order_id]);
      await notifyBuyer(client, rx.order_id, 'rx_rejected', reason);
    }
    await writeAuditTx(client, { userId: rx.user_id, action: 'prescription_rejected', performedBy: pharmacistId,
      newValue: { prescription_id: prescriptionId, order_id: rx.order_id }, notes: reason });
    return { prescription_id: prescriptionId, status: 'rejected' };
  });
}

// Reuse a verified, unexpired prescription of the same buyer for another order
// (e.g. a refill), within the quantity it still allows.
export async function applyPrescriptionToOrder(pharmacistId: string, prescriptionId: string, orderId: string) {
  const r = await applyPrescriptionTx(pharmacistId, prescriptionId, orderId);
  return { ...r, payment: await captureHeldPaymentQuietly(orderId, pharmacistId) };   // Sprint 39 (C-37)
}

function applyPrescriptionTx(pharmacistId: string, prescriptionId: string, orderId: string) {
  return withTransaction(async (client) => {
    await pharmacist(client, pharmacistId);
    const rx = (await client.query(
      `SELECT rx.*, o.user_id AS order_user FROM prescriptions rx, orders o WHERE rx.id = $1 AND o.id = $2`,
      [prescriptionId, orderId])).rows[0];
    if (!rx) throw new AppError('Prescription or order not found', 404);
    if (rx.status !== 'verified') throw new AppError('Only verified prescriptions can be reused', 400);
    if (rx.user_id !== rx.order_user) throw new AppError('Prescription belongs to a different buyer', 400);
    if (!rx.valid_until || new Date(rx.valid_until) < new Date(new Date().toDateString())) throw new AppError('Prescription has expired', 400);
    const covered = await dispenseAgainst(client, prescriptionId, orderId, pharmacistId);
    await writeAuditTx(client, { userId: rx.user_id, action: 'prescription_reused', performedBy: pharmacistId,
      newValue: { prescription_id: prescriptionId, order_id: orderId, lines_covered: covered } });
    const released = await releaseOwnAfterPrescription(client, orderId, pharmacistId);   // same single check (Sprint 35)
    await notifyBuyer(client, orderId, 'rx_verified');
    return { prescription_id: prescriptionId, order_id: orderId, lines_covered: covered, shipments_released: released };
  });
}

/**
 * Sprint 38: complete the prescriber's address / registration number on a verified
 * prescription that lacks them (checked before Sprint 38), so its Schedule H1 lines can
 * be entered in the register and dispatched (C-09). Only empty fields can be filled —
 * the database refuses any other change to a verified prescription (C-08).
 */
export async function completePrescriberDetails(pharmacistId: string, prescriptionId: string,
  input: { prescriber_address?: string; prescriber_reg_no?: string }) {
  return withTransaction(async (client) => {
    await pharmacist(client, pharmacistId);
    const rx = (await client.query(
      `SELECT id, user_id, status, prescriber_address, prescriber_reg_no FROM prescriptions WHERE id = $1 FOR UPDATE`, [prescriptionId])).rows[0];
    if (!rx) throw new AppError('Prescription not found', 404);
    if (rx.status === 'pending') throw new AppError('Verify the prescription instead (the form records the prescriber)', 409);
    if (rx.status !== 'verified') throw new AppError(`A ${rx.status} prescription cannot be completed`, 409);
    const set: Record<string, string> = {};
    for (const k of ['prescriber_address', 'prescriber_reg_no'] as const) {
      if (!input[k]) continue;
      if (String(rx[k] ?? '').trim()) throw new AppError(`The prescriber's ${k === 'prescriber_address' ? 'address' : 'registration number'} is already recorded and cannot be changed`, 409);
      set[k] = input[k]!;
    }
    await client.query(
      `UPDATE prescriptions SET prescriber_address = COALESCE($2, prescriber_address), prescriber_reg_no = COALESCE($3, prescriber_reg_no)
       WHERE id = $1`, [prescriptionId, set.prescriber_address ?? null, set.prescriber_reg_no ?? null]);
    await writeAuditTx(client, { userId: rx.user_id, action: 'prescription_prescriber_completed', performedBy: pharmacistId,
      newValue: { prescription_id: prescriptionId, ...set } });
    return { prescription_id: prescriptionId, ...set };
  });
}

async function notifyBuyer(client: PoolClient, orderId: string, type: string, reason?: string) {
  const o = (await client.query('SELECT user_id, order_number FROM orders WHERE id = $1', [orderId])).rows[0];
  if (o) await queueNotification({ userId: o.user_id, type, orderId, orderNumber: o.order_number, reason });
}
