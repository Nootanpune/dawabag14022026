// Dose reminders ("My medicines", Sprint 33) — the pure part, unit-tested in
// schedule.test.ts. A reminder has 1–6 times of day in India (HH:MM, 24-hour),
// a start date and an optional end date. The schedule is kept only on the server;
// the app asks for the coming doses and sets its phone alerts from them, and a
// Taken / Skipped tap is checked here against a real dose time before it is logged.
import { z } from 'zod';

const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 86_400_000;
export const MAX_TIMES = 6;

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** "8:00" → "08:00"; null when it is not a time of day. */
export function normaliseTime(t: string): string | null {
  const m = String(t).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = m[1].padStart(2, '0');
  const s = `${hh}:${m[2]}`;
  return TIME_RE.test(s) ? s : null;
}

/** Sorted, without repeats; throws a plain message on a bad time. */
export function normaliseTimes(times: string[]): string[] {
  const out = times.map((t) => {
    const n = normaliseTime(t);
    if (!n) throw new Error(`"${t}" is not a time of day (use HH:MM, e.g. 08:00 or 21:30)`);
    return n;
  });
  const unique = [...new Set(out)].sort();
  if (!unique.length) throw new Error('Choose at least one time');
  if (unique.length > MAX_TIMES) throw new Error(`At most ${MAX_TIMES} times a day`);
  return unique;
}

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-05');

export const reminderInputSchema = z.object({
  medicine_name: z.string().trim().min(2, 'Name the medicine').max(200),
  product_id: z.string().uuid().nullable().optional(),
  order_id: z.string().uuid().nullable().optional(),
  dose: z.string().trim().max(80).nullable().optional(),
  times: z.array(z.string()).min(1, 'Choose at least one time').max(MAX_TIMES, `At most ${MAX_TIMES} times a day`),
  start_date: dateStr.optional(),
  end_date: dateStr.nullable().optional(),
  is_active: z.boolean().optional(),
}).strict();

export const reminderUpdateSchema = reminderInputSchema.partial().strict();

export interface ReminderSchedule {
  id: string;
  times: string[];
  start_date: string;        // YYYY-MM-DD
  end_date: string | null;
  is_active: boolean;
}

/** The instant (UTC) of HH:MM on an Indian calendar date. */
export function istInstant(date: string, time: string): Date {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h, mi) - IST_OFFSET_MS);
}

const istDate = (d: Date) => new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

/** Every dose between `from` and `to` (inclusive), oldest first. */
export function dosesBetween(r: ReminderSchedule, from: Date, to: Date): { reminder_id: string; at: Date; time: string }[] {
  if (!r.is_active) return [];
  const out: { reminder_id: string; at: Date; time: string }[] = [];
  let day = istDate(from) < r.start_date ? r.start_date : istDate(from);
  const last = istDate(to);
  for (let i = 0; day <= last && i < 400; i++, day = addDays(day, 1)) {
    if (r.end_date && day > r.end_date) break;
    for (const t of r.times) {
      const at = istInstant(day, t);
      if (at >= from && at <= to) out.push({ reminder_id: r.id, at, time: t });
    }
  }
  return out;
}

/** Is `at` one of this reminder's dose times? (A Taken / Skipped tap must name a real dose.) */
export function isDoseTime(r: ReminderSchedule, at: Date): boolean {
  const day = istDate(at);
  if (day < r.start_date || (r.end_date && day > r.end_date)) return false;
  return r.times.some((t) => istInstant(day, t).getTime() === at.getTime());
}

/** A tap is accepted for doses from 7 days ago up to 12 hours ahead (taken a little early). */
export function tapWindowProblem(at: Date, now: Date): string | null {
  if (at.getTime() > now.getTime() + 12 * 3_600_000) return 'That dose is not due yet';
  if (at.getTime() < now.getTime() - 7 * DAY_MS) return 'Doses older than 7 days cannot be changed';
  return null;
}

export interface AdherenceCount { taken: number; skipped: number; missed: number; total: number }

/** Taken / skipped / not answered for the doses already due in the window. */
export function adherence(doses: { at: Date }[], logs: { scheduled_for: Date; status: 'taken' | 'skipped' }[], now: Date): AdherenceCount {
  const byTime = new Map(logs.map((l) => [new Date(l.scheduled_for).getTime(), l.status]));
  const due = doses.filter((d) => d.at <= now);
  const taken = due.filter((d) => byTime.get(d.at.getTime()) === 'taken').length;
  const skipped = due.filter((d) => byTime.get(d.at.getTime()) === 'skipped').length;
  return { taken, skipped, missed: due.length - taken - skipped, total: due.length };
}
