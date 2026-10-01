// India Standard Time everywhere a person sees a date or a business day starts
// (Dawabag operates only in India). IST is UTC+05:30 all year (no daylight saving).
// The API process itself runs in UTC so that DATE columns parse the same on every
// server; every "today", year and displayed time goes through these helpers, and
// database sessions use Asia/Kolkata (config/database.ts).
export const IST_TZ = 'Asia/Kolkata';
const OFFSET_MS = 330 * 60_000;

/** The current instant shifted so its UTC fields read as IST wall-clock fields */
const shifted = (d: Date = new Date()) => new Date(d.getTime() + OFFSET_MS);

/** Today's date in India, YYYY-MM-DD */
export const todayIST = (d: Date = new Date()) => shifted(d).toISOString().slice(0, 10);

/** Calendar year / month (1-12) in India */
export const istYear = (d: Date = new Date()) => shifted(d).getUTCFullYear();
export const istMonth = (d: Date = new Date()) => shifted(d).getUTCMonth() + 1;

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-IN', { timeZone: IST_TZ, ...opts });
const dateFmt = fmt({ day: '2-digit', month: 'short', year: 'numeric' });
const dateTimeFmt = fmt({ day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });

/** '01 Oct 2026' — a DATE value (UTC midnight) or an instant, read in India */
export const formatDateIST = (v: Date | string | number) => dateFmt.format(new Date(v));
/** '01 Oct 2026, 2:05 pm IST' */
export const formatDateTimeIST = (v: Date | string | number) => `${dateTimeFmt.format(new Date(v))} IST`;
/** 'YYYY-MM-DD HH:mm:ss' in India (log lines) */
export const logStampIST = (d: Date = new Date()) => shifted(d).toISOString().replace('T', ' ').slice(0, 19);
