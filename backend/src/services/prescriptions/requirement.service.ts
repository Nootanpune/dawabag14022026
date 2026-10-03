// Prescription before payment (Sprint 39, owner decision 2026-10-03; Rulebook C-08).
// An order with lines that need a prescription for this buyer cannot be paid for
// until a prescription is attached: one uploaded for it, or a saved one offered for
// it (a verified one still valid, or an uploaded one not yet checked). Checked when
// the order is placed (POST /orders) and again when payment starts (Razorpay and the
// trial's demo), so no client can skip it. The pharmacist still checks it after
// payment — the payment is only authorised until then (payments/rxHold).
import { PoolClient } from 'pg';
import { AppError } from '../../utils/AppError';
import { rxRequiredLines } from '../rxGate.service';

export const PRESCRIPTION_REQUIRED = 'PRESCRIPTION_REQUIRED';

export interface PrescriptionCoverage {
  /** prescription lines not yet covered by a verified prescription */
  waiting: string[];
  /** a prescription is attached for the pharmacist to check */
  attached: boolean;
}

export async function prescriptionCoverage(client: PoolClient, orderId: string): Promise<PrescriptionCoverage> {
  const waiting = (await rxRequiredLines(client, orderId)).filter((l) => !l.prescription_id).map((l) => l.product_name);
  if (!waiting.length) return { waiting, attached: true };
  const r = (await client.query(
    `SELECT (o.requested_prescription_id IS NOT NULL
             OR EXISTS (SELECT 1 FROM prescriptions p WHERE p.order_id = o.id AND p.status IN ('pending', 'verified'))) AS attached
     FROM orders o WHERE o.id = $1`, [orderId])).rows[0];
  return { waiting, attached: !!r?.attached };
}

export function prescriptionRequiredError(names: string[]): AppError {
  return new AppError(
    `Add your prescription before paying: ${names.join(', ')} ${names.length === 1 ? 'needs' : 'need'} a doctor's prescription. `
    + "Upload it or choose a saved one. You'll only be charged after our pharmacist checks it.", 422, true, PRESCRIPTION_REQUIRED);
}

/** Refuses (422 PRESCRIPTION_REQUIRED) while prescription lines have no prescription attached. */
export async function assertPrescriptionProvided(client: PoolClient, orderId: string): Promise<void> {
  const c = await prescriptionCoverage(client, orderId);
  if (c.waiting.length && !c.attached) throw prescriptionRequiredError(c.waiting);
}
