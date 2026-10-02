// Health profile (Sprint 33): allergies, conditions and current medicines for the
// buyer, and family members (name, relation, age, their own allergies and
// conditions). Family members are the account's existing `patients` rows — the
// same list used to book consultations and on orders (one authority).
// Kept only under the buyer's explicit consent (consent_records purpose
// 'health_profile', C-41); withdrawing it deletes the data (C-43, C-44). Our
// pharmacists see it when they check a prescription or an order (C-08); every
// such look is audited (C-46).
import { PoolClient } from 'pg';
import { query, queryOne, withTransaction } from '../../config/database';
import { AppError } from '../../utils/AppError';
import { writeAuditTx } from '../../utils/audit';
import { todayIST } from '../../utils/ist';
import {
  HEALTH_CONSENT_PURPOSE, HEALTH_CONSENT_VERSION, ageNow, cleanList, consentProblem, memberSchema, profileSchema,
} from './rules';

type Ctx = { ip?: string | null; agent?: string | null };

async function currentConsent(db: { query: PoolClient['query'] } | null, userId: string): Promise<{ granted: boolean; recorded_at: string | null }> {
  const sql = `SELECT granted, recorded_at FROM consent_records WHERE user_id = $1 AND purpose = 'health_profile'
               ORDER BY recorded_at DESC LIMIT 1`;
  const row = db ? (await db.query(sql, [userId])).rows[0] : await queryOne<any>(sql, [userId]);
  return { granted: !!row?.granted, recorded_at: row?.recorded_at ?? null };
}

const memberCols = `id, full_name, relationship, age_years, to_char(age_recorded_on, 'YYYY-MM-DD') AS age_recorded_on,
  allergies, conditions, created_at`;

const memberOut = (m: any, today: string) => ({
  id: m.id, full_name: m.full_name, relationship: m.relationship, age: ageNow(m.age_years, m.age_recorded_on, today),
  allergies: m.allergies ?? [], conditions: m.conditions ?? [],
});

export async function getHealthProfile(userId: string) {
  const consent = await currentConsent(null, userId);
  const p = await queryOne<any>(`SELECT allergies, conditions, current_medicines, consented_at, updated_at FROM health_profiles WHERE user_id = $1`, [userId]);
  const members = await query<any>(
    `SELECT ${memberCols} FROM patients WHERE owner_user_id = $1 AND deleted_at IS NULL ORDER BY created_at`, [userId]);
  const today = todayIST();
  return {
    consent: { given: consent.granted, recorded_at: consent.recorded_at, version: HEALTH_CONSENT_VERSION, purpose: HEALTH_CONSENT_PURPOSE },
    allergies: p?.allergies ?? [],
    conditions: p?.conditions ?? [],
    current_medicines: p?.current_medicines ?? [],
    updated_at: p?.updated_at ?? null,
    family_members: members.map((m) => memberOut(m, today)),
  };
}

async function recordConsent(client: PoolClient, userId: string, granted: boolean, ctx: Ctx) {
  await client.query(
    `INSERT INTO consent_records (user_id, purpose, granted, policy_version, notice_language, ip_address, user_agent)
     VALUES ($1, 'health_profile', $2, $3, 'en', $4, $5)`,
    [userId, granted, HEALTH_CONSENT_VERSION, ctx.ip ?? null, (ctx.agent ?? '').slice(0, 500) || null]);
}

/** Consent first (ticked now or given before), then the data. */
async function withConsent<T>(userId: string, ticked: boolean | undefined, ctx: Ctx, fn: (c: PoolClient) => Promise<T>) {
  return withTransaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`health:${userId}`]);
    const consent = await currentConsent(client, userId);
    const problem = consentProblem(consent.granted, ticked);
    if (problem) throw new AppError(problem, 400);
    if (!consent.granted) {
      await recordConsent(client, userId, true, ctx);
      await writeAuditTx(client, { userId, action: 'health_profile_consent_given', performedBy: userId,
        newValue: { version: HEALTH_CONSENT_VERSION } });
    }
    return fn(client);
  });
}

export async function saveHealthProfile(userId: string, body: unknown, ctx: Ctx = {}) {
  const d = profileSchema.parse(body);
  await withConsent(userId, d.consent, ctx, async (client) => {
    await client.query(
      `INSERT INTO health_profiles (user_id, allergies, conditions, current_medicines, consent_version, consented_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (user_id) DO UPDATE SET allergies = EXCLUDED.allergies, conditions = EXCLUDED.conditions,
         current_medicines = EXCLUDED.current_medicines, updated_at = NOW()`,
      [userId, JSON.stringify(cleanList(d.allergies)), JSON.stringify(cleanList(d.conditions)),
        JSON.stringify(cleanList(d.current_medicines)), HEALTH_CONSENT_VERSION]);
    // what changed is the buyer's health data: the audit names the fields only (C-41)
    await writeAuditTx(client, { userId, action: 'health_profile_saved', performedBy: userId,
      newValue: { allergies: d.allergies.length, conditions: d.conditions.length, current_medicines: d.current_medicines.length } });
  });
  return getHealthProfile(userId);
}

export async function addFamilyMember(userId: string, body: unknown & { consent?: boolean }, ctx: Ctx = {}) {
  const { consent, ...rest } = (body ?? {}) as Record<string, unknown>;
  const d = memberSchema.parse(rest);
  await withConsent(userId, consent === true ? true : undefined, ctx, async (client) => {
    const n = Number((await client.query(`SELECT COUNT(*) FROM patients WHERE owner_user_id = $1 AND deleted_at IS NULL`, [userId])).rows[0].count);
    if (n >= 15) throw new AppError('You can add up to 15 family members', 400);
    const id = (await client.query(
      `INSERT INTO patients (owner_user_id, full_name, relationship, age_years, age_recorded_on, allergies, conditions)
       VALUES ($1, $2, $3, $4::smallint, CASE WHEN $4::smallint IS NULL THEN NULL ELSE CURRENT_DATE END, $5, $6) RETURNING id`,
      [userId, d.full_name, d.relationship, d.age_years ?? null, JSON.stringify(cleanList(d.allergies)), JSON.stringify(cleanList(d.conditions))])).rows[0].id;
    await writeAuditTx(client, { userId, action: 'health_profile_member_added', performedBy: userId, newValue: { member_id: id } });
  });
  return getHealthProfile(userId);
}

export async function updateFamilyMember(userId: string, memberId: string, body: unknown, ctx: Ctx = {}) {
  const d = memberSchema.parse(body);
  await withConsent(userId, undefined, ctx, async (client) => {
    const r = await client.query(
      `UPDATE patients SET full_name = $3, relationship = $4, allergies = $6, conditions = $7,
              age_recorded_on = CASE WHEN $5::smallint IS NULL THEN NULL WHEN age_years IS DISTINCT FROM $5::smallint THEN CURRENT_DATE ELSE age_recorded_on END,
              age_years = $5::smallint
       WHERE id = $1 AND owner_user_id = $2 AND deleted_at IS NULL`,
      [memberId, userId, d.full_name, d.relationship, d.age_years ?? null, JSON.stringify(cleanList(d.allergies)), JSON.stringify(cleanList(d.conditions))]);
    if (!r.rowCount) throw new AppError('Family member not found', 404);
    await writeAuditTx(client, { userId, action: 'health_profile_member_updated', performedBy: userId, newValue: { member_id: memberId } });
  });
  return getHealthProfile(userId);
}

/**
 * Removes a family member. Where a consultation, prescription or order names
 * them, those records must keep the link (C-24, C-44): the member is hidden and
 * their health details wiped instead.
 */
async function removeMembersTx(client: PoolClient, userId: string, memberId?: string) {
  const args = memberId ? [userId, memberId] : [userId];
  const which = `owner_user_id = $1 AND deleted_at IS NULL${memberId ? ' AND id = $2' : ''}`;
  const used = `EXISTS (SELECT 1 FROM orders o WHERE o.patient_id = patients.id)
    OR EXISTS (SELECT 1 FROM prescriptions r WHERE r.patient_id = patients.id)
    OR EXISTS (SELECT 1 FROM consultations c WHERE c.patient_id = patients.id)
    OR EXISTS (SELECT 1 FROM digital_prescriptions d WHERE d.patient_id = patients.id)`;
  const kept = await client.query(
    `UPDATE patients SET deleted_at = NOW(), age_years = NULL, age_recorded_on = NULL, allergies = '[]', conditions = '[]'
     WHERE ${which} AND (${used})`, args);
  const gone = await client.query(`DELETE FROM patients WHERE ${which} AND NOT (${used})`, args);
  return (kept.rowCount ?? 0) + (gone.rowCount ?? 0);
}

export async function removeFamilyMember(userId: string, memberId: string) {
  await withTransaction(async (client) => {
    const n = await removeMembersTx(client, userId, memberId);
    if (!n) throw new AppError('Family member not found', 404);
    await writeAuditTx(client, { userId, action: 'health_profile_member_removed', performedBy: userId, newValue: { member_id: memberId } });
  });
  return getHealthProfile(userId);
}

/** Withdraw consent: everything in the health profile is deleted (C-43, C-44). */
export async function deleteHealthProfileTx(client: PoolClient, userId: string, performedBy: string, ctx: Ctx = {}) {
  await client.query(`DELETE FROM health_profiles WHERE user_id = $1`, [userId]);
  const members = await removeMembersTx(client, userId);
  const consent = await currentConsent(client, userId);
  if (consent.granted) await recordConsent(client, userId, false, ctx);
  await writeAuditTx(client, { userId, action: 'health_profile_deleted', performedBy, newValue: { family_members: members } });
}

export async function deleteHealthProfile(userId: string, ctx: Ctx = {}) {
  await withTransaction((client) => deleteHealthProfileTx(client, userId, userId, ctx));
  return getHealthProfile(userId);
}

/**
 * What the pharmacist sees on the prescription check / order review: the person
 * the order is for (a family member when the order names one) — only when the
 * buyer has consented. Each look is audited (C-46).
 */
export async function healthNoteForOrder(staffId: string, orderId: string) {
  const o = await queryOne<any>(`SELECT id, user_id, patient_id, order_number FROM orders WHERE id = $1`, [orderId]);
  if (!o) throw new AppError('Order not found', 404);
  const consent = await currentConsent(null, o.user_id);
  if (!consent.granted) return { order_id: orderId, shared: false };
  const today = todayIST();
  let out: any;
  if (o.patient_id) {
    const m = await queryOne<any>(`SELECT ${memberCols} FROM patients WHERE id = $1 AND owner_user_id = $2`, [o.patient_id, o.user_id]);
    out = m ? { for: 'family_member', ...memberOut(m, today), current_medicines: [] } : null;
  }
  if (!out) {
    const p = await queryOne<any>(`SELECT allergies, conditions, current_medicines FROM health_profiles WHERE user_id = $1`, [o.user_id]);
    out = { for: 'buyer', allergies: p?.allergies ?? [], conditions: p?.conditions ?? [], current_medicines: p?.current_medicines ?? [] };
  }
  await withTransaction((client) => writeAuditTx(client, { userId: o.user_id, action: 'health_profile_viewed', performedBy: staffId,
    newValue: { order_id: orderId, order_number: o.order_number, for: out.for } }));
  return { order_id: orderId, shared: true, ...out };
}
