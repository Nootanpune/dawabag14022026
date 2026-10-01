// src/services/grievance.service.ts — buyer complaints (Rulebook C-36)
// Acknowledge within 48 hours, resolve within 30 days (Consumer Protection
// (E-Commerce) Rules 2020). Overdue flags are computed from the database.
import { query, queryOne, withTransaction } from '../config/database';
import { AppError } from '../utils/AppError';
import { writeAuditTx } from '../utils/audit';
import { queueNotification } from './notification.service';
import { istYear } from '../utils/ist';

export const ACK_HOURS = 48;
export const RESOLVE_DAYS = 30;

const SLA_COLUMNS = `
  (g.acknowledged_at IS NULL AND g.status = 'open' AND g.created_at < NOW() - INTERVAL '${ACK_HOURS} hours') AS ack_overdue,
  (g.resolved_at IS NULL AND g.status NOT IN ('resolved', 'closed') AND g.created_at < NOW() - INTERVAL '${RESOLVE_DAYS} days') AS resolution_overdue,
  g.created_at + INTERVAL '${ACK_HOURS} hours' AS ack_due_at,
  g.created_at + INTERVAL '${RESOLVE_DAYS} days' AS resolve_due_at`;

export async function createGrievance(userId: string, input: { category: string; subject: string; description: string; order_id?: string }) {
  return withTransaction(async (client) => {
    if (input.order_id) {
      const o = (await client.query('SELECT id FROM orders WHERE id = $1 AND user_id = $2', [input.order_id, userId])).rows[0];
      if (!o) throw new AppError('Order not found', 404);
    }
    const seq = (await client.query(`SELECT nextval('grievance_ticket_seq') AS n`)).rows[0].n;
    const ticketNo = `GRV-${istYear()}-${String(seq).padStart(6, '0')}`;
    const g = (await client.query(
      `INSERT INTO grievances (ticket_no, user_id, order_id, category, subject, description)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, ticket_no, status, created_at`,
      [ticketNo, userId, input.order_id || null, input.category, input.subject, input.description])).rows[0];
    await writeAuditTx(client, { userId, action: 'grievance_created', performedBy: userId, newValue: { grievance_id: g.id, ticket_no: ticketNo } });
    return g;
  });
}

export async function listGrievances(filter: { userId?: string; status?: string; overdueOnly?: boolean }) {
  const where: string[] = [];
  const params: any[] = [];
  if (filter.userId) { params.push(filter.userId); where.push(`g.user_id = $${params.length}`); }
  if (filter.status) { params.push(filter.status); where.push(`g.status = $${params.length}`); }
  const rows = await query<any>(
    `SELECT g.id, g.ticket_no, g.category, g.subject, g.status, g.order_id, o.order_number, g.created_at,
            g.acknowledged_at, g.resolved_at, up.full_name AS buyer_name, ${SLA_COLUMNS}
     FROM grievances g LEFT JOIN orders o ON o.id = g.order_id LEFT JOIN user_profiles up ON up.user_id = g.user_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY g.created_at DESC LIMIT 500`, params);
  return filter.overdueOnly ? rows.filter((r) => r.ack_overdue || r.resolution_overdue) : rows;
}

export async function getGrievance(id: string, userId?: string) {
  const g = await queryOne<any>(
    `SELECT g.*, o.order_number, bp.full_name AS buyer_name, ${SLA_COLUMNS} FROM grievances g LEFT JOIN orders o ON o.id = g.order_id
     LEFT JOIN user_profiles bp ON bp.user_id = g.user_id
     WHERE g.id = $1 ${userId ? 'AND g.user_id = $2' : ''}`, userId ? [id, userId] : [id]);
  if (!g) throw new AppError('Complaint not found', 404);
  const messages = await query(
    `SELECT m.id, m.from_staff, m.body, m.created_at, CASE WHEN m.from_staff THEN 'Dawabag support' ELSE up.full_name END AS author
     FROM grievance_messages m LEFT JOIN user_profiles up ON up.user_id = m.author_id
     WHERE m.grievance_id = $1 ORDER BY m.created_at`, [id]);
  return { ...g, messages };
}

export async function addMessage(id: string, authorId: string, body: string, fromStaff: boolean) {
  return withTransaction(async (client) => {
    const g = (await client.query(
      `SELECT id, user_id, ticket_no, status, acknowledged_at FROM grievances WHERE id = $1 ${fromStaff ? '' : 'AND user_id = $2'} FOR UPDATE`,
      fromStaff ? [id] : [id, authorId])).rows[0];
    if (!g) throw new AppError('Complaint not found', 404);
    if (g.status === 'closed') throw new AppError('This complaint is closed', 409);
    await client.query(`INSERT INTO grievance_messages (grievance_id, author_id, from_staff, body) VALUES ($1, $2, $3, $4)`,
      [id, authorId, fromStaff, body]);
    // First staff reply acknowledges the complaint
    if (fromStaff && !g.acknowledged_at) {
      await client.query(`UPDATE grievances SET status = 'acknowledged', acknowledged_at = NOW(), updated_at = NOW() WHERE id = $1`, [id]);
    } else if (!fromStaff && g.status === 'resolved') {
      await client.query(`UPDATE grievances SET status = 'in_progress', resolved_at = NULL, updated_at = NOW() WHERE id = $1`, [id]);
    } else {
      await client.query(`UPDATE grievances SET updated_at = NOW() WHERE id = $1`, [id]);
    }
    if (fromStaff) await queueNotification({ userId: g.user_id, type: 'grievance_update', ticketNo: g.ticket_no });
    return { id };
  });
}

export async function setStatus(id: string, staffId: string, status: 'in_progress' | 'resolved' | 'closed', resolution?: string) {
  return withTransaction(async (client) => {
    const g = (await client.query(`SELECT id, user_id, ticket_no, status FROM grievances WHERE id = $1 FOR UPDATE`, [id])).rows[0];
    if (!g) throw new AppError('Complaint not found', 404);
    if (status === 'resolved' && !resolution) throw new AppError('Describe the resolution', 400);
    await client.query(
      `UPDATE grievances SET status = $2::varchar, assigned_to = COALESCE(assigned_to, $3),
         acknowledged_at = COALESCE(acknowledged_at, NOW()),
         resolved_at = CASE WHEN $2::varchar IN ('resolved', 'closed') THEN COALESCE(resolved_at, NOW()) ELSE NULL END,
         resolution = COALESCE($4, resolution), updated_at = NOW() WHERE id = $1`,
      [id, status, staffId, resolution || null]);
    await writeAuditTx(client, { userId: g.user_id, action: `grievance_${status}`, performedBy: staffId, newValue: { grievance_id: id }, notes: resolution });
    await queueNotification({ userId: g.user_id, type: 'grievance_update', ticketNo: g.ticket_no, status });
    return { id, status };
  });
}
