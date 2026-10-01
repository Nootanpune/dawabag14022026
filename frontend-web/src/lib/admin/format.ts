// Display helpers for admin screens (no business math — values come from the API).

export const CUSTOMER_TYPE_SHORT: Record<string, string> = {
  customer: 'Patient',
  b2b_retailer: 'Retailer',
  b2b_wholesaler: 'Wholesaler',
  doc_hospital: 'Doctor',
};

export const DL_TYPE_LABELS: Record<string, string> = {
  dl20: 'Form 20 (retail)',
  dl21: 'Form 21 (retail)',
  dl20b: 'Form 20B (wholesale)',
  dl21b: 'Form 21B (wholesale)',
};

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
