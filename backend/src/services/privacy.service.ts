// src/services/privacy.service.ts — data-principal rights (Rulebook C-40..C-44)
// Consents are an append-only log; the latest row per purpose is current.
// The data export is built from the database on each request and streamed to
// the caller — never written anywhere. Erasure anonymises the account but keeps
// records the law requires (tax invoices, prescriptions, H1 register — C-44).
import { PoolClient } from 'pg';
import { query, queryOne, withTransaction } from '../config/database';
import { AppError } from '../utils/AppError';
import { writeAuditTx } from '../utils/audit';
import { queueNotification } from './notification.service';
import { privacyNoticeRef } from './policy.service';

// Consent cites the privacy notice actually published, in the language shown (C-40; one authority: policy_documents)
async function noticeFor(userId: string) {
  const u = await queryOne<{ preferred_language: string | null }>(`SELECT preferred_language FROM users WHERE id = $1`, [userId]);
  const lang = (['en', 'mr', 'hi'] as const).find((l) => l === u?.preferred_language) ?? 'en';
  return privacyNoticeRef(lang);
}

export async function getConsents(userId: string) {
  const current = await query(
    `SELECT DISTINCT ON (purpose) purpose, granted, policy_version, recorded_at
     FROM consent_records WHERE user_id = $1 ORDER BY purpose, recorded_at DESC`, [userId]);
  const history = await query(
    `SELECT purpose, granted, policy_version, recorded_at FROM consent_records
     WHERE user_id = $1 ORDER BY recorded_at DESC LIMIT 100`, [userId]);
  const notice = await noticeFor(userId);
  return { current, history, policy_version: notice.version, notice_language: notice.language };
}

export async function setMarketingConsent(userId: string, granted: boolean, ip: string | null, agent: string | null) {
  return setConsent(userId, 'marketing', granted, ip, agent);
}

// Optional purposes the buyer can switch on and off at any time (DPDP s.6(4))
export async function setConsent(userId: string, purpose: 'marketing' | 'whatsapp', granted: boolean, ip: string | null, agent: string | null) {
  const notice = await noticeFor(userId);
  await query(
    `INSERT INTO consent_records (user_id, purpose, granted, policy_version, notice_language, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`, [userId, purpose, granted, notice.version, notice.language, ip, agent]);
  return getConsents(userId);
}

// Everything held about the user, assembled on the fly
export async function exportUserData(userId: string) {
  const one = (sql: string) => queryOne(sql, [userId]);
  const many = (sql: string) => query(sql, [userId]);
  return {
    generated_at: new Date().toISOString(),
    account: await one(`SELECT id, email, mobile, role, customer_type, kyc_status, preferred_language, created_at
                        FROM users WHERE id = $1`),
    profile: await one(`SELECT full_name, date_of_birth, gender FROM user_profiles WHERE user_id = $1`),
    addresses: await many(`SELECT label, full_name, mobile, address_line1, address_line2, city, state, pincode, created_at
                           FROM addresses WHERE user_id = $1 AND deleted_at IS NULL`),
    patients: await many(`SELECT full_name, date_of_birth, gender, relationship FROM patients
                          WHERE owner_user_id = $1 AND deleted_at IS NULL`),
    orders: await many(`SELECT o.order_number, o.status, o.total_paise, o.created_at,
                          json_agg(json_build_object('product', oi.product_name, 'quantity', oi.quantity)) AS items
                        FROM orders o JOIN order_items oi ON oi.order_id = o.id
                        WHERE o.user_id = $1 GROUP BY o.id ORDER BY o.created_at DESC`),
    prescriptions: await many(`SELECT id, status, prescriber_name, prescribed_on, patient_name, valid_until, created_at
                               FROM prescriptions WHERE user_id = $1 ORDER BY created_at DESC`),
    consents: await many(`SELECT purpose, granted, policy_version, recorded_at FROM consent_records
                          WHERE user_id = $1 ORDER BY recorded_at`),
    complaints: await many(`SELECT ticket_no, category, subject, status, created_at, resolved_at FROM grievances
                            WHERE user_id = $1 ORDER BY created_at`),
    refills: await many(`SELECT id, frequency_days, next_refill_date, is_active FROM refill_subscriptions WHERE user_id = $1`),
    data_requests: await many(`SELECT request_type, status, created_at, handled_at, outcome FROM data_requests
                               WHERE user_id = $1 ORDER BY created_at`),
  };
}

export async function createDataRequest(userId: string, type: 'erasure' | 'correction', details?: string) {
  return withTransaction(async (client) => {
    const open = (await client.query(
      `SELECT id FROM data_requests WHERE user_id = $1 AND request_type = $2 AND status = 'pending'`, [userId, type])).rows[0];
    if (open) throw new AppError(`You already have a pending ${type} request`, 409);
    const r = (await client.query(
      `INSERT INTO data_requests (user_id, request_type, details) VALUES ($1, $2, $3) RETURNING id, request_type, status, created_at`,
      [userId, type, details || null])).rows[0];
    await writeAuditTx(client, { userId, action: `data_${type}_requested`, performedBy: userId, newValue: { request_id: r.id } });
    return r;
  });
}

export async function listMyDataRequests(userId: string) {
  return query(`SELECT id, request_type, details, status, outcome, created_at, handled_at FROM data_requests
                WHERE user_id = $1 ORDER BY created_at DESC`, [userId]);
}

export async function listDataRequests(status?: string) {
  return query(
    `SELECT d.*, up.full_name AS user_name, u.mobile FROM data_requests d
     JOIN users u ON u.id = d.user_id LEFT JOIN user_profiles up ON up.user_id = d.user_id
     ${status ? 'WHERE d.status = $1' : ''} ORDER BY d.created_at LIMIT 500`, status ? [status] : []);
}

export async function handleDataRequest(adminId: string, id: string, action: 'complete' | 'reject', outcome: string) {
  const result = await handleDataRequestTx(adminId, id, action, outcome);
  // An erased account has no contact details left, so only others are told
  if (!(action === 'complete' && result.request_type === 'erasure')) {
    await queueNotification({ userId: result.user_id, type: 'data_request_update', requestType: result.request_type,
      status: result.status, reason: outcome });
  }
  return { id: result.id, status: result.status };
}

async function handleDataRequestTx(adminId: string, id: string, action: 'complete' | 'reject', outcome: string) {
  return withTransaction(async (client) => {
    const r = (await client.query(`SELECT * FROM data_requests WHERE id = $1 FOR UPDATE`, [id])).rows[0];
    if (!r) throw new AppError('Request not found', 404);
    if (r.status !== 'pending') throw new AppError(`Request is already ${r.status}`, 409);
    if (action === 'complete' && r.request_type === 'erasure') await anonymiseUser(client, r.user_id);
    await client.query(
      `UPDATE data_requests SET status = $2, outcome = $3, handled_by = $4, handled_at = NOW() WHERE id = $1`,
      [id, action === 'complete' ? 'completed' : 'rejected', outcome, adminId]);
    await writeAuditTx(client, { userId: r.user_id, action: `data_${r.request_type}_${action}d`, performedBy: adminId,
      newValue: { request_id: id }, notes: outcome });
    return { id, status: action === 'complete' ? 'completed' : 'rejected', user_id: r.user_id as string, request_type: r.request_type as string };
  });
}

// Erasure: remove identity and contact data; keep statutory records
async function anonymiseUser(client: PoolClient, userId: string) {
  const blockers = (await client.query(
    `SELECT
       (SELECT COUNT(*) FROM orders WHERE user_id = $1
          AND status IN ('confirmed', 'rx_pending', 'rx_verified', 'packing', 'packed', 'dispatched'))::int AS open_orders,
       (SELECT COALESCE(credit_used_paise, 0) FROM users WHERE id = $1)::int AS credit_due`, [userId])).rows[0];
  if (blockers.open_orders > 0) throw new AppError('The account has orders in progress; erase after they close', 409);
  if (blockers.credit_due > 0) throw new AppError('The account has unpaid credit; erase after it is settled', 409);

  const tag = 'D' + userId.replace(/-/g, '').slice(0, 14);
  await client.query(
    `UPDATE users SET email = NULL, mobile = $2, password_hash = NULL, fcm_token = NULL, is_active = FALSE,
       deleted_at = NOW(), updated_at = NOW() WHERE id = $1`, [userId, tag]);
  await client.query(
    `UPDATE user_profiles SET full_name = 'Deleted user', date_of_birth = NULL, gender = NULL, updated_at = NOW() WHERE user_id = $1`,
    [userId]);
  await client.query(`UPDATE addresses SET deleted_at = COALESCE(deleted_at, NOW()) WHERE user_id = $1`, [userId]);
  await client.query(`UPDATE patients SET deleted_at = COALESCE(deleted_at, NOW()) WHERE owner_user_id = $1`, [userId]);
  await client.query(`UPDATE refill_subscriptions SET is_active = FALSE WHERE user_id = $1`, [userId]);
  await client.query(`DELETE FROM cart_items WHERE user_id = $1`, [userId]);
  await client.query(`DELETE FROM user_devices WHERE user_id = $1`, [userId]);
  await client.query(`DELETE FROM carts WHERE user_id = $1`, [userId]);
  await client.query(
    `INSERT INTO consent_records (user_id, purpose, granted, policy_version) VALUES ($1, 'marketing', FALSE, $2)`,
    [userId, (await privacyNoticeRef('en')).version]);
}
