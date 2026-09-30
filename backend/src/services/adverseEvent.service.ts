// src/services/adverseEvent.service.ts — side-effect reports (Rulebook C-29)
// Patients report suspected adverse reactions; the pharmacist reviews and
// forwards them to the Pharmacovigilance Programme of India (PvPI), recording
// the PvPI reference. Serious reports are due in 15 days, others in 30.
import { query, queryOne, withTransaction } from '../config/database';
import { AppError } from '../utils/AppError';
import { writeAuditTx } from '../utils/audit';
import { queueNotification } from './notification.service';

export const SERIOUSNESS = ['non_serious', 'hospitalised', 'life_threatening', 'disability', 'death', 'other_serious'] as const;
export const OUTCOMES = ['recovered', 'recovering', 'not_recovered', 'fatal', 'unknown'] as const;

export interface AdrInput {
  product_id: string;
  order_id?: string;
  batch_number?: string;
  patient_initials: string;
  patient_age_years?: number;
  patient_gender?: 'male' | 'female' | 'other';
  reaction: string;
  onset_date?: string;
  seriousness: typeof SERIOUSNESS[number];
  outcome?: typeof OUTCOMES[number];
}

const due = (t: string) => `${t}.created_at + CASE WHEN ${t}.seriousness = 'non_serious' THEN INTERVAL '30 days' ELSE INTERVAL '15 days' END`;

export async function createAdr(userId: string, input: AdrInput) {
  return withTransaction(async (client) => {
    const p = (await client.query('SELECT id, name FROM products WHERE id = $1', [input.product_id])).rows[0];
    if (!p) throw new AppError('Product not found', 404);
    if (input.order_id) {
      const o = (await client.query('SELECT 1 FROM orders WHERE id = $1 AND user_id = $2', [input.order_id, userId])).rows[0];
      if (!o) throw new AppError('Order not found', 404);
    }
    const seq = (await client.query(`SELECT nextval('adr_report_seq') AS n`)).rows[0].n;
    const reportNo = `ADR-${new Date().getFullYear()}-${String(seq).padStart(6, '0')}`;
    const r = (await client.query(
      `INSERT INTO adverse_event_reports (report_no, user_id, order_id, product_id, batch_number, patient_initials,
         patient_age_years, patient_gender, reaction, onset_date, seriousness, outcome)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id, report_no, status, created_at`,
      [reportNo, userId, input.order_id ?? null, input.product_id, input.batch_number ?? null, input.patient_initials,
       input.patient_age_years ?? null, input.patient_gender ?? null, input.reaction, input.onset_date ?? null,
       input.seriousness, input.outcome ?? null])).rows[0];
    await writeAuditTx(client, { userId, action: 'adr_reported', performedBy: userId,
      newValue: { report_id: r.id, report_no: reportNo, product_id: input.product_id, seriousness: input.seriousness } });
    // Serious reports go straight to every pharmacist
    if (input.seriousness !== 'non_serious') {
      const pharmacists = (await client.query(`SELECT id FROM users WHERE role = 'pharmacist_rx' AND is_active AND deleted_at IS NULL`)).rows;
      for (const ph of pharmacists) {
        await queueNotification({ userId: ph.id, type: 'adr_serious', reportNo, productName: p.name });
      }
    }
    return r;
  });
}

export async function listAdr(filter: { userId?: string; status?: string }) {
  const where: string[] = [];
  const params: any[] = [];
  if (filter.userId) { params.push(filter.userId); where.push(`a.user_id = $${params.length}`); }
  if (filter.status) { params.push(filter.status); where.push(`a.status = $${params.length}`); }
  return query(
    `SELECT a.id, a.report_no, a.product_id, p.name AS product_name, a.batch_number, a.seriousness, a.status,
            a.pvpi_reference, a.created_at, ${due('a')} AS forward_due_at,
            (a.status IN ('new', 'reviewed') AND NOW() > ${due('a')}) AS overdue
     FROM adverse_event_reports a JOIN products p ON p.id = a.product_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY (a.seriousness <> 'non_serious') DESC, a.created_at DESC LIMIT 500`, params);
}

export async function getAdr(id: string, userId?: string) {
  const r = await queryOne(
    `SELECT a.*, p.name AS product_name, o.order_number FROM adverse_event_reports a
     JOIN products p ON p.id = a.product_id LEFT JOIN orders o ON o.id = a.order_id
     WHERE a.id = $1 ${userId ? 'AND a.user_id = $2' : ''}`, userId ? [id, userId] : [id]);
  if (!r) throw new AppError('Report not found', 404);
  return r;
}

export async function reviewAdr(pharmacistId: string, id: string, input: { status: 'reviewed' | 'forwarded' | 'closed'; notes: string; pvpi_reference?: string }) {
  if (input.status === 'forwarded' && !input.pvpi_reference) throw new AppError('Enter the PvPI reference when forwarding', 400);
  return withTransaction(async (client) => {
    const r = (await client.query(`SELECT id, user_id, status FROM adverse_event_reports WHERE id = $1 FOR UPDATE`, [id])).rows[0];
    if (!r) throw new AppError('Report not found', 404);
    if (r.status === 'closed') throw new AppError('Report is closed', 409);
    await client.query(
      `UPDATE adverse_event_reports SET status = $2, pharmacist_notes = $3, pvpi_reference = COALESCE($4, pvpi_reference),
         reviewed_by = $5, reviewed_at = COALESCE(reviewed_at, NOW()),
         forwarded_at = CASE WHEN $2::varchar = 'forwarded' THEN NOW() ELSE forwarded_at END
       WHERE id = $1`, [id, input.status, input.notes, input.pvpi_reference ?? null, pharmacistId]);
    await writeAuditTx(client, { userId: r.user_id, action: `adr_${input.status}`, performedBy: pharmacistId,
      newValue: { report_id: id, pvpi_reference: input.pvpi_reference ?? null }, notes: input.notes });
    return { id, status: input.status };
  });
}
