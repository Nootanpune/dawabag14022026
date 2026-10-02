import { FORM_INFO, LICENCE_FORMS } from '../licences/forms';
// Display helpers for admin screens (no business math — values come from the API).

export const CUSTOMER_TYPE_SHORT: Record<string, string> = {
  customer: 'Patient',
  b2b_retailer: 'Retailer',
  b2b_wholesaler: 'Wholesaler',
  doc_hospital: 'Doctor',
};

// Every drug licence form (Sprint 30): "Form 20B (wholesale)", "Form 25 (manufacture for sale)" …
export const DL_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  LICENCE_FORMS.filter((f) => f !== 'other').map((f) => [f, `${FORM_INFO[f].label} (${FORM_INFO[f].hint.charAt(0).toLowerCase()}${FORM_INFO[f].hint.slice(1)})`]));

/** Rupees typed in the UI → paise for the API. Returns null for invalid input. */
export function rupeesToPaise(rupees: string): number | null {
  const n = Number(rupees.replace(/,/g, '').trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/** ₹ text for a *_paise value; accepts the string form Postgres uses for bigint sums. */
export function formatPaise(paise: number | string | null | undefined): string {
  if (paise == null || paise === '') return '—';
  const n = Number(paise);
  if (!Number.isFinite(n)) return '—';
  return `₹${(n / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
