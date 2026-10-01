// India Standard Time helpers — the ONE place the web app turns instants and
// calendar dates into text, and works out "today". Dawabag operates only in
// India, so every date/time shown or computed is IST (Asia/Kolkata, UTC+05:30,
// no DST) whatever the viewer's browser zone is (owner decision, Sprint 20).
// Nothing here reads or writes storage; the server stays the source of truth.

export const IST_TZ = 'Asia/Kolkata';
/** IST is a fixed UTC+05:30 (India has no daylight saving). */
export const IST_OFFSET = '+05:30';
const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 864e5;

type DateInput = string | number | Date | null | undefined;

// Fixed English month names so the server and the browser render the same
// text whatever ICU version they ship ("Sep" vs "Sept").
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

const IST_PARTS = new Intl.DateTimeFormat('en-IN', {
  timeZone: IST_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

interface IstParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number; // 0-23
  minute: number;
}

function toDate(value: string | number | Date): Date | null {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Wall-clock fields of an instant in India time. */
export function istParts(value: string | number | Date): IstParts | null {
  const d = toDate(value);
  if (!d) return null;
  const parts = IST_PARTS.formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour') % 24, minute: get('minute') };
}

/**
 * Calendar fields for a DATE value. A plain 'YYYY-MM-DD' (a DATE column) is
 * read as-is, never shifted by a zone. Anything else is an instant and is read
 * in IST (a DATE sent as UTC midnight is 05:30 IST the same day).
 */
function calendarParts(value: string | number | Date): IstParts | null {
  if (typeof value === 'string') {
    const m = DATE_ONLY.exec(value.trim());
    if (m) return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]), hour: 0, minute: 0 };
  }
  return istParts(value);
}

const pad = (n: number) => String(n).padStart(2, '0');
const ymdOf = (p: IstParts) => `${p.year}-${pad(p.month)}-${pad(p.day)}`;
const dateText = (p: IstParts) => `${pad(p.day)} ${MONTHS[p.month - 1]} ${p.year}`;
const timeText = (p: IstParts) => `${((p.hour + 11) % 12) + 1}:${pad(p.minute)} ${p.hour < 12 ? 'am' : 'pm'}`;

/** '01 Oct 2026' — the IST calendar day ('—' when empty or invalid). */
export function formatDateIST(value: DateInput): string {
  if (value == null || value === '') return '—';
  const p = calendarParts(value);
  return p ? dateText(p) : '—';
}

/** Options for time formatters: `zone: true` appends " IST" (staff deadlines, slots). */
export interface ZoneOpt {
  zone?: boolean;
}
const withZone = (text: string, opt?: ZoneOpt) => (opt?.zone ? `${text} IST` : text);

/** '01 Oct 2026, 2:05 pm' in India time ('—' when empty or invalid). */
export function formatDateTimeIST(value: DateInput, opt?: ZoneOpt): string {
  if (value == null || value === '') return '—';
  const p = istParts(value);
  return p ? withZone(`${dateText(p)}, ${timeText(p)}`, opt) : '—';
}

/** '2:05 pm' in India time ('—' when empty or invalid). */
export function formatTimeIST(value: DateInput, opt?: ZoneOpt): string {
  if (value == null || value === '') return '—';
  const p = istParts(value);
  return p ? withZone(timeText(p), opt) : '—';
}

/** A wall-clock time of day from the API ('14:30' / '14:30:00', already IST) → '2:30 pm'. */
export function formatClockTime(t: string | null | undefined, opt?: ZoneOpt): string {
  if (!t) return '—';
  const [h, m] = t.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return '—';
  return withZone(timeText({ year: 0, month: 1, day: 1, hour: h, minute: m }), opt);
}

/** 'Thursday, 1 October' for headings, in India time. */
export function formatLongDayIST(value: string | number | Date = Date.now()): string {
  const p = calendarParts(value);
  if (!p) return '—';
  const weekday = WEEKDAYS[new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay()];
  return `${weekday}, ${p.day} ${MONTHS_LONG[p.month - 1]}`;
}

/** The IST calendar day of an instant as 'YYYY-MM-DD'. */
export function toISTDateString(value: string | number | Date): string {
  const p = calendarParts(value);
  return p ? ymdOf(p) : '';
}

/** Today in India as 'YYYY-MM-DD' (for <input type="date"> min/max/defaults). */
export function todayIST(now: number = Date.now()): string {
  return toISTDateString(now);
}

/** The IST date `days` before today, 'YYYY-MM-DD'. */
export function daysAgoIST(days: number, now: number = Date.now()): string {
  return toISTDateString(now - days * DAY_MS);
}

/** The current year in India. */
export function currentYearIST(): number {
  return istParts(Date.now())?.year ?? new Date().getUTCFullYear();
}

/** 'YYYY-MM-DD' moved by `days` calendar days (pure calendar math, no zone). */
export function addDaysToDate(date: string, days: number): string {
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** First and last day of the previous calendar month in India, 'YYYY-MM-DD'. */
export function lastMonthIST(now: number = Date.now()): { from: string; to: string } {
  const p = istParts(now) ?? { year: 1970, month: 1, day: 1, hour: 0, minute: 0 };
  const first = new Date(Date.UTC(p.year, p.month - 2, 1));
  const last = new Date(Date.UTC(p.year, p.month - 1, 0));
  return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) };
}

/** True when a DATE ('YYYY-MM-DD' or instant) is today or later in India. */
export function isOnOrAfterTodayIST(value: string | null | undefined, now: number = Date.now()): boolean {
  if (!value) return false;
  const day = toISTDateString(value);
  return day !== '' && day >= todayIST(now);
}

/** Now in India as a datetime-local value ('YYYY-MM-DDTHH:mm'), for defaults and max= limits. */
export function nowISTInput(now: number = Date.now()): string {
  return new Date(now + IST_OFFSET_MS).toISOString().slice(0, 16);
}

/** A datetime-local value typed as India time → ISO string with +05:30, or undefined if invalid. */
export function istInputToIso(v: string | null | undefined): string | undefined {
  const m = v ? /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(:\d{2})?$/.exec(v) : null;
  if (!m) return undefined;
  const iso = `${m[1]}${m[2] ?? ':00'}${IST_OFFSET}`;
  return Number.isNaN(new Date(iso).getTime()) ? undefined : iso;
}

/** An instant → datetime-local value in India time ('YYYY-MM-DDTHH:mm'); '' when empty/invalid. */
export function isoToISTInput(value: DateInput): string {
  if (value == null || value === '') return '';
  const d = toDate(value);
  return d ? nowISTInput(d.getTime()) : '';
}
