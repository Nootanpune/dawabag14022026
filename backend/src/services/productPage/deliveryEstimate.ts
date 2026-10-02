// "Get it by <weekday, date>" and "Expires on or after <Mon YYYY>" on the product
// page (Sprint 33) — the pure part, unit-tested in deliveryEstimate.test.ts.
// Deliberately conservative and always labelled "Estimated": it reuses the
// delivery promises the checkout already shows (pincode_serviceability:
// estimated_days for any seller, dawabag_delivery_hours for Dawabag's own
// stock — checkoutSummary.service), takes the SLOWER of the sellers that could
// supply, adds a day for the pharmacist's prescription check (C-08), starts
// counting tomorrow after the afternoon dispatch cut-off, and never promises a
// Sunday. All dates are Indian dates (IST).

/** Orders after this hour (IST) are counted from the next day. */
export const DISPATCH_CUTOFF_HOUR_IST = 14;
const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 86_400_000;

export interface EtaInput {
  now: Date;
  /** pincode_serviceability.estimated_days */
  estimatedDays: number;
  /** pincode_serviceability.dawabag_delivery_hours (null = Dawabag does not deliver here itself) */
  ownDeliveryHours: number | null;
  /** Dawabag's own sellable stock can supply (and cold chain allowed to this PIN) */
  ownStock: boolean;
  /** a partner pharmacy's sellable stock can supply */
  partnerStock: boolean;
  /** a prescription line: the pharmacist checks it first */
  needsPrescriptionCheck: boolean;
}

/** YYYY-MM-DD (IST) by which the parcel should arrive; null when nobody can supply it. */
export function estimatedDeliveryDate(i: EtaInput): string | null {
  const sellers: number[] = [];
  if (i.ownStock) sellers.push(i.ownDeliveryHours && i.ownDeliveryHours > 0 ? Math.ceil(i.ownDeliveryHours / 24) : i.estimatedDays);
  if (i.partnerStock) sellers.push(i.estimatedDays);
  if (!sellers.length) return null;
  let days = Math.max(1, ...sellers.map((d) => (Number.isFinite(d) && d > 0 ? Math.ceil(d) : 5)));
  if (i.needsPrescriptionCheck) days += 1;
  const istNow = new Date(i.now.getTime() + IST_OFFSET_MS);          // UTC fields read as IST wall clock
  if (istNow.getUTCHours() >= DISPATCH_CUTOFF_HOUR_IST) days += 1;
  const istMidnight = Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate());
  let d = new Date(istMidnight + days * DAY_MS);
  if (d.getUTCDay() === 0) d = new Date(d.getTime() + DAY_MS);       // no Sunday promise
  return d.toISOString().slice(0, 10);
}

const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Get it by Monday, 5 Oct" for YYYY-MM-DD */
export function deliveryLabel(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `Get it by ${WEEKDAY[day]}, ${d} ${MONTH[m - 1]}`;
}

/** "Mar 2027" for the supplied batch's expiry month (YYYY-MM or a date); null if unknown. */
export function expiryMonthLabel(v: string | Date | null | undefined): string | null {
  if (!v) return null;
  const s = v instanceof Date ? v.toISOString() : String(v);
  const m = s.match(/^(\d{4})-(\d{2})/);
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return `${MONTH[month - 1]} ${m[1]}`;
}

/** Shown for 2–8 °C products (C-25). */
export const COLD_CHAIN_NOTE = 'Delivered in an insulated pack. Keep refrigerated on arrival.';
