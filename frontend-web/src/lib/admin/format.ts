// Display helpers for admin screens (no business math — values come from the API).

/** e.g. "30 Sep 2026, 9:45 pm" in India time */
export function formatDateTimeIST(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatDateIST(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

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
