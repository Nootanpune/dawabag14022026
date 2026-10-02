// Cell text → values: expiry dates, quantities, rupee amounts and percentages as
// billing software writes them. Pure: unit-tested in values.test.ts.

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const year4 = (y: number) => (y < 100 ? 2000 + y : y);

function dayDate(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > lastDay(y, m) || y < 1990 || y > 2100) return null;
  return iso(y, m, d);
}
/** Month-only expiry ("12/27") means the end of that month, as printed on packs. */
function monthDate(y: number, m: number): string | null {
  return m >= 1 && m <= 12 && y >= 1990 && y <= 2100 ? iso(y, m, lastDay(y, m)) : null;
}

/** Excel's serial day number (1900 date system) → date. */
export function excelSerialToIso(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 20000 || serial > 80000) return null;   // 1954 … 2119
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/**
 * Expiry as written by billing software → YYYY-MM-DD, or null when unreadable.
 * Accepts YYYY-MM-DD (Excel date cells), DD/MM/YYYY, DD-MM-YY, MM/YY, MM/YYYY,
 * MMM-YY, MMM YYYY, DD-MMM-YYYY and Excel serial numbers. Day-first always (India).
 */
export function parseExpiry(raw: unknown): string | null {
  const s = String(raw ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[t ].*)?$/);
  if (m) return dayDate(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (m) return dayDate(year4(+m[3]), +m[2], +m[1]);
  m = s.match(/^(\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (m) return monthDate(year4(+m[2]), +m[1]);
  m = s.match(/^(\d{4})[/.-](\d{1,2})$/);
  if (m) return monthDate(+m[1], +m[2]);
  m = s.match(/^(\d{1,2})[ /.-]([a-z]{3,4})[a-z]*[ /.,-]+(\d{2}|\d{4})$/);
  if (m && MONTHS[m[2]]) return dayDate(year4(+m[3]), MONTHS[m[2]], +m[1]);
  m = s.match(/^([a-z]{3,4})[a-z]*[ /.,'-]+(\d{2}|\d{4})$/);
  if (m && MONTHS[m[1]]) return monthDate(year4(+m[2]), MONTHS[m[1]]);
  m = s.match(/^(\d{5})(\.\d+)?$/);
  if (m) return excelSerialToIso(Number(s));
  return null;
}

export interface Quantity { value: number | null; error?: string; note?: string }

/**
 * Stock quantity in selling packs. "1,200" → 1200; "10+2" (billed + free) → 12;
 * loose units after a decimal point are dropped (Dawabag sells whole packs).
 */
export function parseQuantity(raw: unknown): Quantity {
  const s = String(raw ?? '').trim().replace(/,/g, '');
  if (!s || s === '-') return { value: null };
  const parts = s.split('+').map((p) => p.trim());
  if (parts.some((p) => !/^-?\d+(\.\d+)?$/.test(p))) return { value: null, error: `Quantity "${raw}" is not a number` };
  const total = parts.reduce((a, p) => a + Number(p), 0);
  if (total < 0) return { value: total, error: 'Quantity is negative' };
  if (!Number.isInteger(total)) return { value: Math.floor(total), note: `Loose units dropped: ${total} counted as ${Math.floor(total)} packs` };
  return { value: total };
}

/** Rupees ("₹ 1,234.50", "Rs.40", "      40.00") → paise; null when blank, NaN when not a number. */
export function parseRupeesToPaise(raw: unknown): number | null {
  const s = String(raw ?? '').trim().replace(/^(₹|rs\.?|inr)\s*/i, '').replace(/[,\s]/g, '');
  if (!s || s === '-') return null;
  if (!/^-?\d+(\.\d+)?$/.test(s)) return NaN;
  return Math.round(Number(s) * 100);
}

/** "12%", "12.00", "GST 12" → 12; null when blank, NaN when unreadable. */
export function parsePercent(raw: unknown): number | null {
  const s = String(raw ?? '').trim().replace(/^(gst|igst|tax)\s*/i, '').replace(/%$/, '').trim();
  if (!s) return null;
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

/** Whole days from `from` to `to` (both YYYY-MM-DD). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
