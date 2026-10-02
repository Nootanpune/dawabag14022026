// Sprint 29 — what a pharmacist must decide before a draft product (made from a
// partner's request) can be approved, in plain words. Pure: unit-tested.
//   Schedule decides everything else: Schedule X / NDPS can never be listed online
//   (C-10), so approving with those only needs the generic name for the record;
//   any other schedule needs the full clinical, tax, declaration (C-17) and copy
//   (C-19) details. Cold chain must be chosen, never assumed (C-25).
import { requiresPrescription } from '../../utils/customerType';
import { findRestrictedClaims } from '../../utils/claimsCheck';

export const SCHEDULES = ['OTC', 'Schedule G', 'Schedule H', 'Schedule H1', 'Schedule X', 'NDPS'] as const;
export const NEVER_ONLINE: readonly string[] = ['Schedule X', 'NDPS'];
export const DOSAGE_FORMS = [
  'Tablet', 'Capsule', 'Syrup', 'Suspension', 'Drops', 'Injection', 'Ointment', 'Cream', 'Gel', 'Lotion',
  'Solution', 'Powder', 'Sachet', 'Inhaler', 'Spray', 'Soap', 'Device', 'Other',
] as const;
/** The GST slabs the catalogue accepts (same as the catalogue import). */
export const GST_RATES = [0, 5, 12, 18, 28] as const;
/** HSN codes are 4, 6 or 8 digits (e-invoices need 6+ for most sellers). */
export const HSN_RE = /^(\d{4}|\d{6}|\d{8})$/;
export const DESCRIPTION_MIN = 10;

export interface DraftFields {
  name: string | null;
  generic_name: string | null;
  composition: string | null;
  strength: string | null;
  dosage_form: string | null;
  drug_schedule: string | null;
  cold_chain: boolean | null;
  hsn_code: string | null;
  gst_rate: number | string | null;
  category: string | null;
  description: string | null;
  storage_instructions: string | null;
  net_quantity: string | null;
  manufacturer_name: string | null;
  manufacturer_address: string | null;
  country_of_origin: string | null;
}

const filled = (v: unknown, min = 1) => String(v ?? '').trim().length >= min;

/** Prescription for a patient buyer, derived from the schedule as everywhere else (C-08). */
export function prescriptionFor(schedule: string | null | undefined): 'needed' | 'not needed' | 'never sold online' | null {
  if (!schedule) return null;
  if (NEVER_ONLINE.includes(schedule)) return 'never sold online';
  return requiresPrescription('customer', schedule) ? 'needed' : 'not needed';
}

/** What is still missing before Approve; empty = ready. */
export function approvalProblems(f: DraftFields, coldChainDecided: boolean): string[] {
  const out: string[] = [];
  if (!f.drug_schedule) return ['Choose the drug schedule'];
  if (!(SCHEDULES as readonly string[]).includes(f.drug_schedule)) return ['Drug schedule is not one we know'];
  if (!filled(f.generic_name, 2)) out.push('Add the generic name');
  // Never listed (C-10): kept for the record only, nothing else to complete
  if (NEVER_ONLINE.includes(f.drug_schedule)) return out;
  if (!filled(f.name, 2)) out.push('Add the product name');
  if (!filled(f.strength)) out.push('Add the strength (write "none" if it has none)');
  if (!f.dosage_form || !(DOSAGE_FORMS as readonly string[]).includes(f.dosage_form)) out.push('Choose the dosage form');
  if (!coldChainDecided) out.push('Choose whether it needs cold chain (2–8 °C)');
  else if (f.cold_chain && !filled(f.storage_instructions)) out.push('Add storage instructions for a cold-chain product (C-25)');
  if (!f.hsn_code || !HSN_RE.test(f.hsn_code)) out.push('Add the HSN code (4, 6 or 8 digits)');
  if (f.gst_rate === null || f.gst_rate === undefined || f.gst_rate === '' || !(GST_RATES as readonly number[]).includes(Number(f.gst_rate))) {
    out.push('Choose the GST rate');
  }
  if (!filled(f.category, 2)) out.push('Choose the category');
  if (!filled(f.description, DESCRIPTION_MIN)) out.push('Add a short description for buyers');
  // Pre-packed goods declarations shown on the product page (C-17)
  if (!filled(f.net_quantity)) out.push('Add the net quantity (pack)');
  if (!filled(f.manufacturer_name, 2)) out.push('Add the manufacturer name');
  if (!filled(f.manufacturer_address, 5)) out.push('Add the manufacturer address');
  if (!filled(f.country_of_origin, 2)) out.push('Add the country of origin');
  return out;
}

/** Things worth a second look that do not block approval. */
export function draftWarnings(f: DraftFields): string[] {
  const out: string[] = [];
  const gst = f.gst_rate === null || f.gst_rate === '' ? null : Number(f.gst_rate);
  if (f.hsn_code?.startsWith('30') && gst !== null && gst >= 18) {
    out.push(`Medicines (HSN chapter 30) are not usually taxed at ${gst}%: check the GST rate`);
  }
  if (f.hsn_code && !f.hsn_code.startsWith('30') && f.dosage_form && ['Tablet', 'Capsule', 'Injection', 'Syrup'].includes(f.dosage_form)) {
    out.push('A medicine is usually under HSN chapter 30: check the HSN code');
  }
  const claims = findRestrictedClaims(f.name, f.description, f.composition, f.storage_instructions);
  if (claims.length) out.push(`The copy may make a claim ("${claims[0].claim}" + "${claims[0].condition}"): keep it to the generic name and pack (C-19)`);
  return out;
}

/** The minimal buyer description the content rules allow: generic name, strength, form and pack — no claims (C-17, C-19). */
export function suggestedDescription(f: Pick<DraftFields, 'generic_name' | 'strength' | 'dosage_form' | 'net_quantity'>): string | null {
  if (!filled(f.generic_name, 2)) return null;
  const strength = f.strength && !/^(none|n\/?a|-)$/i.test(f.strength.trim()) ? ` ${f.strength.trim()}` : '';
  const form = f.dosage_form && f.dosage_form !== 'Other' ? ` ${f.dosage_form.toLowerCase()}` : '';
  const pack = filled(f.net_quantity) ? ` Pack: ${f.net_quantity!.trim()}.` : '';
  return `${f.generic_name!.trim()}${strength}${form}.${pack}`;
}

/** GST rate from the partner's file, kept only when it is a slab we accept (else left for the pharmacist). */
export function gstFromFile(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return (GST_RATES as readonly number[]).includes(n) ? n : null;
}
