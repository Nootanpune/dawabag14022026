// Regulator recall / NSQ alerts (C-28): an alert list is entered once, matched against
// our batches, and each matched product is recalled or cleared — within 4 hours of
// receipt. Records are final (migration 17 triggers).
import { query, queryOne, withTransaction } from '../../config/database';
import { AppError } from '../../utils/AppError';
import { writeAuditTx } from '../../utils/audit';
import { NotificationPayload, queueNotification } from '../notification.service';
import { recallBatchTx } from '../recall.service';
import { batchKey } from './batchKey';
import { findBatchMatches } from './match';
import type { AlertLineInput } from './parse';

export type AlertSource = 'cdsco_nsq' | 'fda_maharashtra' | 'manufacturer' | 'other';
export interface AlertInput { source: AlertSource; reference: string; received_at: string; lines: AlertLineInput[] }

const SOURCE_LABEL: Record<AlertSource, string> = {
  cdsco_nsq: 'CDSCO NSQ', fda_maharashtra: 'FDA Maharashtra', manufacturer: 'Manufacturer', other: 'Alert',
};

async function notifyAdmins(payload: Omit<NotificationPayload, 'userId'> & { type: string }) {
  const admins = await query<{ id: string }>(`SELECT id FROM users WHERE role IN ('admin', 'super_admin') AND is_active AND deleted_at IS NULL`);
  for (const a of admins) await queueNotification({ ...payload, userId: a.id });
}

export async function createAlert(userId: string, input: AlertInput) {
  const received = new Date(input.received_at);
  if (Number.isNaN(received.getTime())) throw new AppError('Enter when the alert was received', 400);
  if (received.getTime() > Date.now() + 5 * 60_000) throw new AppError('The alert cannot be received in the future', 400);
  if (received.getTime() < Date.now() - 366 * 864e5) throw new AppError('The alert is more than a year old', 400);
  const lines = input.lines.map((l, i) => ({ ...l, line_no: i + 1, key: batchKey(l.batch_number) }));
  const bad = lines.find((l) => !l.key);
  if (bad) throw new AppError(`Line ${bad.line_no}: the batch number has no letters or digits`, 400);

  const result = await withTransaction(async (client) => {
    const seq = (await client.query(`SELECT nextval('recall_alert_seq') AS n`)).rows[0].n;
    const alert = (await client.query(
      `INSERT INTO recall_alerts (alert_no, source, reference, received_at, due_at, entered_by)
       VALUES ($1, $2, $3, $4, $4::timestamptz + INTERVAL '4 hours', $5) RETURNING id, alert_no, due_at`,
      [`RA-${String(seq).padStart(5, '0')}`, input.source, input.reference, received.toISOString(), userId])).rows[0];
    const lineIds = new Map<string, string[]>();
    for (const l of lines) {
      const id = (await client.query(
        `INSERT INTO recall_alert_lines (alert_id, line_no, drug_name, batch_number, batch_key, manufacturer, reason)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [alert.id, l.line_no, l.drug_name, l.batch_number, l.key, l.manufacturer ?? null, l.reason ?? null])).rows[0].id;
      lineIds.set(l.key, [...(lineIds.get(l.key) ?? []), id]);
    }
    const matches = await findBatchMatches(client, [...lineIds.keys()]);
    let matched = 0;
    for (const m of matches) {
      for (const lineId of lineIds.get(m.batch_key) ?? []) {
        await client.query(
          `INSERT INTO recall_alert_matches (line_id, product_id, batch_numbers, units_held, units_sold) VALUES ($1, $2, $3, $4, $5)`,
          [lineId, m.product_id, m.batch_numbers, m.units_held, m.units_sold]);
        matched++;
      }
    }
    await writeAuditTx(client, { userId: null, action: 'recall_alert_entered', performedBy: userId,
      newValue: { alert_no: alert.alert_no, source: input.source, reference: input.reference, lines: lines.length, matches: matched } });
    return { id: alert.id, alert_no: alert.alert_no, due_at: alert.due_at, lines: lines.length, matches: matched };
  });
  if (result.matches) {
    await notifyAdmins({ type: 'recall_alert', reportNo: result.alert_no, count: result.matches,
      reason: `${SOURCE_LABEL[input.source]}: ${input.reference}`, dueAt: new Date(result.due_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) });
  }
  return result;
}

const SUMMARY = `
  SELECT a.id, a.alert_no, a.source, a.reference, a.received_at, a.due_at, a.entered_at, up.full_name AS entered_by_name,
         (SELECT COUNT(*)::int FROM recall_alert_lines l WHERE l.alert_id = a.id) AS lines,
         COUNT(m.id)::int AS matches,
         COUNT(m.id) FILTER (WHERE m.decision = 'pending')::int AS pending,
         COUNT(m.id) FILTER (WHERE m.decision = 'recalled')::int AS recalled,
         COUNT(m.id) FILTER (WHERE m.decision = 'cleared')::int AS cleared,
         (COUNT(m.id) FILTER (WHERE m.decision = 'pending') > 0 AND a.due_at < NOW()) AS overdue
  FROM recall_alerts a
  LEFT JOIN recall_alert_lines l ON l.alert_id = a.id
  LEFT JOIN recall_alert_matches m ON m.line_id = l.id
  LEFT JOIN user_profiles up ON up.user_id = a.entered_by`;

export async function listAlerts(open: boolean) {
  return query(`${SUMMARY} GROUP BY a.id, up.full_name
    ${open ? `HAVING COUNT(m.id) FILTER (WHERE m.decision = 'pending') > 0` : ''}
    ORDER BY a.received_at DESC LIMIT 200`);
}

export async function getAlert(id: string) {
  const alert = await queryOne(`${SUMMARY} WHERE a.id = $1 GROUP BY a.id, up.full_name`, [id]);
  if (!alert) throw new AppError('Alert not found', 404);
  const lines = await query(
    `SELECT l.id, l.line_no, l.drug_name, l.batch_number, l.manufacturer, l.reason,
            COALESCE(json_agg(json_build_object('id', m.id, 'product_id', m.product_id, 'product_name', p.name,
              'manufacturer', COALESCE(p.manufacturer_name, p.marketed_by), 'batch_numbers', m.batch_numbers,
              'units_held', m.units_held, 'units_sold', m.units_sold, 'decision', m.decision, 'recall_id', m.recall_id,
              'notes', m.notes, 'decided_at', m.decided_at, 'decided_by_name', dp.full_name) ORDER BY p.name)
              FILTER (WHERE m.id IS NOT NULL), '[]') AS matches
     FROM recall_alert_lines l
     LEFT JOIN recall_alert_matches m ON m.line_id = l.id
     LEFT JOIN products p ON p.id = m.product_id
     LEFT JOIN user_profiles dp ON dp.user_id = m.decided_by
     WHERE l.alert_id = $1 GROUP BY l.id ORDER BY (COUNT(m.id) = 0), l.line_no`, [id]);
  return { ...alert, lines };
}

async function lockPendingMatch(client: any, matchId: string) {
  const m = (await client.query(
    `SELECT m.*, l.drug_name, l.batch_number AS alert_batch, l.reason AS alert_reason, a.alert_no, a.source, a.reference
     FROM recall_alert_matches m JOIN recall_alert_lines l ON l.id = m.line_id JOIN recall_alerts a ON a.id = l.alert_id
     WHERE m.id = $1 FOR UPDATE OF m`, [matchId])).rows[0];
  if (!m) throw new AppError('Match not found', 404);
  if (m.decision !== 'pending') throw new AppError(`Already ${m.decision}`, 409);
  return m;
}

// The product is the one on the list: recall every spelling of the batch we hold or sold
export async function recallMatch(userId: string, matchId: string) {
  return withTransaction(async (client) => {
    const m = await lockPendingMatch(client, matchId);
    const reason = `${SOURCE_LABEL[m.source as AlertSource]} ${m.alert_no}: ${m.drug_name} batch ${m.alert_batch}${m.alert_reason ? ` — ${m.alert_reason}` : ''}`;
    const recalls = [];
    let recallId: string | null = null;
    for (const batch of m.batch_numbers as string[]) {
      const existing = (await client.query(`SELECT id FROM batch_recalls WHERE product_id = $1 AND batch_number = $2`, [m.product_id, batch])).rows[0];
      if (existing) { recallId ??= existing.id; continue; }       // recalled earlier (another alert or by hand)
      const r = await recallBatchTx(client, userId, { product_id: m.product_id, batch_number: batch, reason, source: m.reference.slice(0, 100) });
      recallId ??= r.id;
      recalls.push(r);
    }
    await client.query(
      `UPDATE recall_alert_matches SET decision = 'recalled', recall_id = $2, decided_by = $3, decided_at = NOW() WHERE id = $1`,
      [matchId, recallId, userId]);
    await writeAuditTx(client, { userId: null, action: 'recall_alert_recalled', performedBy: userId,
      newValue: { alert_no: m.alert_no, product_id: m.product_id, batches: m.batch_numbers } });
    return { id: matchId, decision: 'recalled', recall_id: recallId, recalls };
  });
}

// Not the product on the list (same batch number, different drug or maker)
export async function clearMatch(userId: string, matchId: string, notes: string) {
  return withTransaction(async (client) => {
    const m = await lockPendingMatch(client, matchId);
    await client.query(
      `UPDATE recall_alert_matches SET decision = 'cleared', notes = $2, decided_by = $3, decided_at = NOW() WHERE id = $1`,
      [matchId, notes, userId]);
    await writeAuditTx(client, { userId: null, action: 'recall_alert_cleared', performedBy: userId, notes,
      newValue: { alert_no: m.alert_no, product_id: m.product_id, batch: m.alert_batch } });
    return { id: matchId, decision: 'cleared' };
  });
}

// A receipt or listing was refused for a product not matched at entry (no stock then):
// the admin checks it and clears that product for that line
export async function clearProductForLine(userId: string, lineId: string, productId: string, notes: string) {
  return withTransaction(async (client) => {
    const l = (await client.query(
      `SELECT l.id, l.batch_number, a.alert_no FROM recall_alert_lines l JOIN recall_alerts a ON a.id = l.alert_id WHERE l.id = $1`, [lineId])).rows[0];
    if (!l) throw new AppError('Alert line not found', 404);
    const p = (await client.query(`SELECT id FROM products WHERE id = $1`, [productId])).rows[0];
    if (!p) throw new AppError('Product not found', 404);
    const r = (await client.query(
      `INSERT INTO recall_alert_matches (line_id, product_id, decision, notes, decided_by, decided_at)
       VALUES ($1, $2, 'cleared', $3, $4, NOW()) ON CONFLICT (line_id, product_id) DO NOTHING RETURNING id`,
      [lineId, productId, notes, userId])).rows[0];
    if (!r) throw new AppError('This product is already matched to the line: decide it there', 409);
    await writeAuditTx(client, { userId: null, action: 'recall_alert_cleared', performedBy: userId, notes,
      newValue: { alert_no: l.alert_no, product_id: productId, batch: l.batch_number } });
    return { id: r.id, decision: 'cleared' };
  });
}

// Job recall_alert_watch: alerts past their 4 hours with undecided matches, once each
export async function runRecallAlertWatch() {
  const overdue = await query<{ id: string; alert_no: string; pending: number }>(
    `UPDATE recall_alerts a SET overdue_notified_at = NOW()
     WHERE a.overdue_notified_at IS NULL AND a.due_at < NOW() AND EXISTS (
       SELECT 1 FROM recall_alert_lines l JOIN recall_alert_matches m ON m.line_id = l.id
       WHERE l.alert_id = a.id AND m.decision = 'pending')
     RETURNING a.id, a.alert_no,
       (SELECT COUNT(*)::int FROM recall_alert_lines l JOIN recall_alert_matches m ON m.line_id = l.id
         WHERE l.alert_id = a.id AND m.decision = 'pending') AS pending`);
  for (const a of overdue) await notifyAdmins({ type: 'recall_alert_overdue', reportNo: a.alert_no, count: a.pending });
  return { overdue_alerts: overdue.length };
}
