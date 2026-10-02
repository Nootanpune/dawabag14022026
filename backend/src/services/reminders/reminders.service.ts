// "My medicines" dose reminders (Sprint 33). The schedule and the Taken / Skipped
// answers live only here (standing rule: the server is the single source of
// truth); the app re-creates its phone alerts from GET /reminders/upcoming on
// start and sign-in and keeps nothing itself. Reminders are the buyer's own
// personal data: included in "Download my data" and removed on erasure (C-43,
// C-44). Nothing here changes an order or a prescription.
import { query, queryOne, withTransaction } from '../../config/database';
import { AppError } from '../../utils/AppError';
import { todayIST } from '../../utils/ist';
import {
  ReminderSchedule, adherence, dosesBetween, isDoseTime, normaliseTimes, reminderInputSchema, reminderUpdateSchema, tapWindowProblem,
} from './schedule';

const MAX_REMINDERS = 30;
const DAY_MS = 86_400_000;

const COLS = `r.id, r.product_id, r.medicine_name, r.dose, r.times, to_char(r.start_date, 'YYYY-MM-DD') AS start_date,
  to_char(r.end_date, 'YYYY-MM-DD') AS end_date, r.source, r.order_id, r.is_active, r.created_at, r.updated_at,
  p.name AS product_name`;

const toSchedule = (r: any): ReminderSchedule =>
  ({ id: r.id, times: r.times, start_date: r.start_date, end_date: r.end_date, is_active: r.is_active });

function times(input: string[]) {
  try { return normaliseTimes(input); } catch (e) { throw new AppError((e as Error).message, 400); }
}

async function own(userId: string, id: string) {
  const r = await queryOne<any>(
    `SELECT ${COLS} FROM medicine_reminders r LEFT JOIN products p ON p.id = r.product_id WHERE r.id = $1 AND r.user_id = $2`, [id, userId]);
  if (!r) throw new AppError('Reminder not found', 404);
  return r;
}

/** Every reminder with today's doses and the answer given for each. */
export async function listReminders(userId: string, now = new Date()) {
  const rows = await query<any>(
    `SELECT ${COLS} FROM medicine_reminders r LEFT JOIN products p ON p.id = r.product_id
     WHERE r.user_id = $1 ORDER BY r.is_active DESC, r.medicine_name`, [userId]);
  const today = todayIST(now);
  const dayStart = new Date(Date.parse(`${today}T00:00:00+05:30`));
  const dayEnd = new Date(dayStart.getTime() + DAY_MS - 1);
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS);
  const logs = await query<any>(
    `SELECT reminder_id, scheduled_for, status FROM reminder_dose_logs WHERE user_id = $1 AND scheduled_for >= $2`,
    [userId, weekAgo < dayStart ? weekAgo : dayStart]);
  return rows.map((r) => {
    const mine = logs.filter((l) => l.reminder_id === r.id);
    const byTime = new Map(mine.map((l) => [new Date(l.scheduled_for).getTime(), l.status]));
    return {
      ...r,
      today: dosesBetween(toSchedule(r), dayStart, dayEnd).map((d) => ({
        time: d.time, scheduled_for: d.at.toISOString(), status: byTime.get(d.at.getTime()) ?? null })),
      last_7_days: adherence(dosesBetween(toSchedule(r), weekAgo, now), mine, now),
    };
  });
}

/** The coming doses (for the app's phone alerts), up to `hours` ahead. */
export async function upcomingDoses(userId: string, hours: number, now = new Date()) {
  const rows = await query<any>(
    `SELECT ${COLS} FROM medicine_reminders r LEFT JOIN products p ON p.id = r.product_id
     WHERE r.user_id = $1 AND r.is_active = TRUE`, [userId]);
  const to = new Date(now.getTime() + Math.min(Math.max(hours, 1), 168) * 3_600_000);
  return rows
    .flatMap((r) => dosesBetween(toSchedule(r), now, to).map((d) => ({
      reminder_id: r.id, medicine_name: r.medicine_name, dose: r.dose, time: d.time, scheduled_for: d.at.toISOString() })))
    .sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for))
    .slice(0, 60);   // phones keep a limited number of scheduled alerts
}

/** Medicines from the buyer's delivered orders (last 12 months) that have no reminder yet. */
export async function reminderSuggestions(userId: string) {
  return query(
    `SELECT DISTINCT ON (oi.product_id) oi.product_id, oi.product_name AS medicine_name, o.id AS order_id,
            o.order_number, o.created_at AS ordered_at
     FROM orders o JOIN order_items oi ON oi.order_id = o.id
     WHERE o.user_id = $1 AND o.status = 'delivered' AND o.created_at > NOW() - INTERVAL '365 days'
       AND NOT EXISTS (SELECT 1 FROM medicine_reminders r WHERE r.user_id = $1 AND r.product_id = oi.product_id AND r.is_active)
     ORDER BY oi.product_id, o.created_at DESC
     LIMIT 50`, [userId]);
}

export async function createReminder(userId: string, body: unknown) {
  const d = reminderInputSchema.parse(body);
  const t = times(d.times);
  const start = d.start_date ?? todayIST();
  if (d.end_date && d.end_date < start) throw new AppError('The end date is before the start date', 400);
  return withTransaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`reminders:${userId}`]);
    const n = Number((await client.query(`SELECT COUNT(*) FROM medicine_reminders WHERE user_id = $1`, [userId])).rows[0].count);
    if (n >= MAX_REMINDERS) throw new AppError(`You can keep up to ${MAX_REMINDERS} reminders`, 400);
    // From an order: only the buyer's own order with that medicine on it
    if (d.order_id) {
      const ok = (await client.query(
        `SELECT 1 FROM orders o JOIN order_items oi ON oi.order_id = o.id
         WHERE o.id = $1 AND o.user_id = $2 AND ($3::uuid IS NULL OR oi.product_id = $3)`, [d.order_id, userId, d.product_id ?? null])).rows[0];
      if (!ok) throw new AppError('That order is not yours or does not have this medicine', 400);
    }
    if (d.product_id) {
      const p = (await client.query(`SELECT 1 FROM products WHERE id = $1`, [d.product_id])).rows[0];
      if (!p) throw new AppError('Medicine not found', 400);
    }
    const id = (await client.query(
      `INSERT INTO medicine_reminders (user_id, product_id, medicine_name, dose, times, start_date, end_date, source, order_id, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [userId, d.product_id ?? null, d.medicine_name, d.dose || null, t, start, d.end_date ?? null,
        d.order_id ? 'order' : 'manual', d.order_id ?? null, d.is_active ?? true])).rows[0].id;
    return id as string;
  }).then((id) => own(userId, id));
}

export async function updateReminder(userId: string, id: string, body: unknown) {
  const d = reminderUpdateSchema.parse(body);
  const before = await own(userId, id);
  const t = d.times ? times(d.times) : before.times;
  const start = d.start_date ?? before.start_date;
  const end = d.end_date === undefined ? before.end_date : d.end_date;
  if (end && end < start) throw new AppError('The end date is before the start date', 400);
  await query(
    `UPDATE medicine_reminders SET medicine_name = $3, dose = $4, times = $5, start_date = $6, end_date = $7, is_active = $8,
            updated_at = NOW() WHERE id = $1 AND user_id = $2`,
    [id, userId, d.medicine_name ?? before.medicine_name, d.dose === undefined ? before.dose : d.dose || null, t, start, end,
      d.is_active ?? before.is_active]);
  return own(userId, id);
}

/** Removes the reminder and its Taken / Skipped answers (the buyer's own data, nothing statutory). */
export async function deleteReminder(userId: string, id: string) {
  await own(userId, id);
  await query(`DELETE FROM medicine_reminders WHERE id = $1 AND user_id = $2`, [id, userId]);
  return { id, deleted: true };
}

/** Taken / Skipped for one dose; a later tap on the same dose replaces the answer. */
export async function logDose(userId: string, id: string, scheduledFor: string, status: 'taken' | 'skipped', now = new Date()) {
  const r = await own(userId, id);
  const at = new Date(scheduledFor);
  if (Number.isNaN(at.getTime())) throw new AppError('Unknown dose time', 400);
  if (!isDoseTime({ ...toSchedule(r), is_active: true }, at)) throw new AppError('That is not one of this reminder’s dose times', 400);
  const late = tapWindowProblem(at, now);
  if (late) throw new AppError(late, 400);
  return queryOne(
    `INSERT INTO reminder_dose_logs (reminder_id, user_id, scheduled_for, status) VALUES ($1, $2, $3, $4)
     ON CONFLICT (reminder_id, scheduled_for) DO UPDATE SET status = EXCLUDED.status, recorded_at = NOW()
     RETURNING reminder_id, scheduled_for, status, recorded_at`, [id, userId, at.toISOString(), status]);
}
