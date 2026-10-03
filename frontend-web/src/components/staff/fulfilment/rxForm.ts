// Draft ⇄ API body for the pharmacist's verification form (C-03, C-08).
import { isRxSchedule } from '@/lib/drugSchedule';
import type { StaffOrderItem, VerifyRxInput } from '@/lib/fulfilment/types';

export interface RxLineDraft {
  product_id: string;
  product_name: string;
  ordered: number;
  prescribed: string;
}

export interface RxDraft {
  prescriber_name: string;
  prescriber_reg_no: string;
  prescriber_address: string;
  prescribed_on: string;
  patient_name: string;
  valid_days: string;
  notes: string;
  lines: RxLineDraft[];
}

/**
 * Lines that still need a prescription: Schedule H / H1 and not yet covered.
 * The server decides finally (trade buyers are exempt; rxRequiredLines).
 */
export function rxLinesFor(items: StaffOrderItem[]): RxLineDraft[] {
  const byProduct = new Map<string, RxLineDraft>();
  for (const i of items) {
    if (!isRxSchedule(i.drug_schedule) || i.prescription_id) continue;
    const prev = byProduct.get(i.product_id);
    if (prev) prev.ordered += i.quantity;
    else byProduct.set(i.product_id, { product_id: i.product_id, product_name: i.product_name, ordered: i.quantity, prescribed: '' });
  }
  return [...byProduct.values()].map((l) => ({ ...l, prescribed: String(l.ordered) }));
}

export function emptyDraft(patientName: string, lines: RxLineDraft[]): RxDraft {
  return { prescriber_name: '', prescriber_reg_no: '', prescriber_address: '', prescribed_on: '', patient_name: patientName, valid_days: '180', notes: '', lines };
}

export function toVerifyBody(d: RxDraft): { body: VerifyRxInput } | { error: string } {
  if (d.prescriber_name.trim().length < 3) return { error: 'Enter the prescriber’s name' };
  if (d.prescriber_reg_no.trim().length < 3) return { error: 'Enter the prescriber’s registration number' };
  // The Schedule H1 register needs it; a missing address refuses dispatch (Sprint 38, C-09)
  if (d.prescriber_address.trim().length < 5) return { error: 'Enter the prescriber’s address as written on the prescription' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.prescribed_on)) return { error: 'Enter the prescription date' };
  if (d.patient_name.trim().length < 2) return { error: 'Enter the patient’s name' };
  const validDays = Number(d.valid_days);
  if (!Number.isInteger(validDays) || validDays < 1 || validDays > 365) return { error: 'Validity must be 1–365 days' };
  if (!d.lines.length) return { error: 'This order has no prescription lines to verify' };
  const items = [];
  for (const l of d.lines) {
    const q = Number(l.prescribed);
    if (!Number.isInteger(q) || q < 1) return { error: `Enter the prescribed quantity for ${l.product_name}` };
    items.push({ product_id: l.product_id, prescribed_qty: q });
  }
  return {
    body: {
      prescriber_name: d.prescriber_name.trim(),
      prescriber_reg_no: d.prescriber_reg_no.trim(),
      prescriber_address: d.prescriber_address.trim(),
      prescribed_on: d.prescribed_on,
      patient_name: d.patient_name.trim(),
      valid_days: validDays,
      items,
      ...(d.notes.trim() ? { notes: d.notes.trim() } : {}),
    },
  };
}
