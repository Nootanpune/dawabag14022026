// Two-step sign-in records (Sprint 42): enrolment with an authenticator app, checking a code
// at sign-in, recovery codes, switching it off, and a super-admin's reset of another login.
// Every enrolment, switch-off, reset, recovery-code use and wrong code is written to the
// audit log (C-46). Codes are never logged or audited; the secret is stored encrypted.
import bcrypt from 'bcryptjs';
import QRCode from 'qrcode';
import { PoolClient } from 'pg';
import { query, queryOne, withTransaction } from '../../config/database';
import { AppError } from '../../utils/AppError';
import { writeAudit, writeAuditTx } from '../../utils/audit';
import { getSetting } from '../settings.service';
import { clearWrongCodes, countWrongCode, FirstStep, isPaused, pauseLeftSeconds } from './challenge';
import { decryptSecret, encryptSecret, generateRecoveryCodes, hashRecoveryCode, looksLikeRecoveryCode, RECOVERY_CODE_COUNT } from './keys';
import { appliesToRole, mayDisable, MAX_WRONG_CODES, policyFrom, TWO_FACTOR_ROLES, TWO_FACTOR_SETTING, TwoFactorPolicy } from './policy';
import { base32Encode, generateSecret, matchTotp, otpauthUri } from './totp';

export const ISSUER = 'DAWA BAG';
type Q = Pick<PoolClient, 'query'>;

export async function twoFactorPolicy(db?: Q): Promise<TwoFactorPolicy> {
  return policyFrom(await getSetting<unknown>(TWO_FACTOR_SETTING, 'optional', db));
}

export async function isEnrolled(userId: string, db?: Q): Promise<boolean> {
  const sql = `SELECT 1 FROM user_two_factor WHERE user_id = $1 AND status = 'active'`;
  return db ? (await db.query(sql, [userId])).rowCount! > 0 : !!(await queryOne(sql, [userId]));
}

const PAUSED = 'TWO_FACTOR_PAUSED';
async function pausedError(userId: string) {
  const s = await pauseLeftSeconds(userId);
  return new AppError(`Too many wrong codes. Please wait ${Math.ceil(s / 60)} minutes and try again.`, 429, true, PAUSED);
}
/** A code tried while paused is refused unchecked — and still audited as a failed attempt (C-46). */
async function refuseWhilePaused(userId: string, ip: string | null, context: Record<string, unknown>) {
  if (!(await isPaused(userId))) return;
  await writeAudit({ userId, action: 'two_factor_failed', performedBy: userId, ip, newValue: { ...context, reason: 'paused' } });
  throw await pausedError(userId);
}

/**
 * A code from the authenticator: valid for the current 30-second step or one either side,
 * and only once — the newest accepted step is kept and an older or equal one is refused
 * (replay protection). Runs on the locked row.
 */
async function useAuthenticatorCode(c: PoolClient, userId: string, row: { secret_enc: string; last_used_step: string | null }, code: string): Promise<boolean> {
  let secret: Buffer;
  try { secret = decryptSecret(userId, row.secret_enc); } catch {
    throw new AppError('Your authenticator cannot be checked on this server (its key changed). Use a recovery code, or ask a super admin to reset your two-step sign-in.', 409, true, 'TWO_FACTOR_KEY_CHANGED');
  }
  const step = matchTotp(secret, code, Date.now());
  if (step === null) return false;
  if (row.last_used_step !== null && step <= Number(row.last_used_step)) return false;
  await c.query(`UPDATE user_two_factor SET last_used_step = $2 WHERE user_id = $1`, [userId, step]);
  return true;
}

/** A recovery code: works once (marked used in the same statement). */
async function useRecoveryCode(c: PoolClient, userId: string, code: string): Promise<boolean> {
  const r = await c.query(
    `UPDATE user_recovery_codes SET used_at = NOW() WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL RETURNING id`,
    [userId, hashRecoveryCode(code)]);
  return (r.rowCount ?? 0) > 0;
}

async function newRecoveryCodesTx(c: PoolClient, userId: string): Promise<string[]> {
  const codes = generateRecoveryCodes();
  await c.query(`DELETE FROM user_recovery_codes WHERE user_id = $1`, [userId]);
  for (const code of codes) {
    await c.query(`INSERT INTO user_recovery_codes (user_id, code_hash) VALUES ($1, $2)`, [userId, hashRecoveryCode(code)]);
  }
  return codes;
}

/** A wrong code: counted per login, audited; the fifth pauses the login's second step. */
async function wrongCode(userId: string, ip: string | null, context: Record<string, unknown>): Promise<never> {
  const n = await countWrongCode(userId);
  await writeAudit({ userId, action: 'two_factor_failed', performedBy: userId, ip, newValue: { ...context, attempt: n } });
  if (n >= MAX_WRONG_CODES) {
    await writeAudit({ userId, action: 'two_factor_paused', performedBy: null, ip, newValue: { ...context, wrong_codes: n } });
    throw await pausedError(userId);
  }
  throw new AppError('That code is not right. Check the 6-digit code in your authenticator app (or a recovery code) and try again.', 400, true, 'TWO_FACTOR_CODE_WRONG');
}

async function signInUser(userId: string) {
  const u = await queryOne<{ id: string; role: string; mobile: string; password_hash: string | null }>(
    `SELECT id, role, mobile, password_hash FROM users WHERE id = $1 AND deleted_at IS NULL AND is_active`, [userId]);
  if (!u) throw new AppError('Account not found', 404);
  return u;
}

// ── Enrolment ──────────────────────────────────────────────────────────────

/** Starts (or restarts) enrolment: a new secret, shown once as a QR code and as text. */
export async function startEnrolment(userId: string) {
  const u = await signInUser(userId);
  if (!appliesToRole(u.role)) throw new AppError('Two-step sign-in is for Dawabag staff and partner logins', 403);
  const secret = generateSecret();
  const saved = await query(
    `INSERT INTO user_two_factor (user_id, secret_enc, status) VALUES ($1, $2, 'pending')
     ON CONFLICT (user_id) DO UPDATE SET secret_enc = EXCLUDED.secret_enc, last_used_step = NULL, created_at = NOW()
       WHERE user_two_factor.status = 'pending'
     RETURNING user_id`, [userId, encryptSecret(userId, secret)]);
  if (!saved.length) throw new AppError('Two-step sign-in is already on for this login', 409, true, 'TWO_FACTOR_ALREADY_ON');
  const uri = otpauthUri(secret, u.mobile, ISSUER);
  // The QR code is drawn here, on the server — the secret never goes to another service
  const svg = await QRCode.toString(uri, { type: 'svg', errorCorrectionLevel: 'M', margin: 1 });
  const text = base32Encode(secret);
  return {
    secret: text.match(/.{1,4}/g)!.join(' '),
    otpauth_uri: uri,
    qr_svg_data_url: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
    issuer: ISSUER, account: u.mobile, digits: 6, period: 30,
  };
}

/** Confirms enrolment with the first code from the app; returns the ten recovery codes (shown once). */
export async function confirmEnrolment(userId: string, code: string, ip: string | null, via: FirstStep | 'signed_in'): Promise<string[]> {
  await refuseWhilePaused(userId, ip, { stage: 'enrol', via });
  const out = await withTransaction(async (c) => {
    const row = (await c.query(`SELECT status, secret_enc, last_used_step FROM user_two_factor WHERE user_id = $1 FOR UPDATE`, [userId])).rows[0];
    if (!row) throw new AppError('Start setting up two-step sign-in first', 409, true, 'TWO_FACTOR_NOT_STARTED');
    if (row.status === 'active') throw new AppError('Two-step sign-in is already on for this login', 409, true, 'TWO_FACTOR_ALREADY_ON');
    if (!(await useAuthenticatorCode(c, userId, row, code))) return null;
    await c.query(`UPDATE user_two_factor SET status = 'active', confirmed_at = NOW() WHERE user_id = $1`, [userId]);
    const codes = await newRecoveryCodesTx(c, userId);
    await writeAuditTx(c, { userId, action: 'two_factor_enrolled', performedBy: userId, ip, newValue: { via, recovery_codes: codes.length } });
    return codes;
  });
  if (!out) return wrongCode(userId, ip, { stage: 'enrol', via });
  await clearWrongCodes(userId);
  return out;
}

// ── The second step at sign-in (and before switching it off / new recovery codes) ──

export type SecondStep = 'authenticator' | 'recovery_code';

export async function checkSecondStep(userId: string, code: string, ip: string | null, context: { stage: string; via?: string }): Promise<{ method: SecondStep; recoveryCodesLeft: number }> {
  await refuseWhilePaused(userId, ip, context);
  const input = String(code ?? '').trim();
  const res = await withTransaction(async (c) => {
    const row = (await c.query(`SELECT secret_enc, last_used_step FROM user_two_factor WHERE user_id = $1 AND status = 'active' FOR UPDATE`, [userId])).rows[0];
    if (!row) throw new AppError('Two-step sign-in is not on for this login', 409, true, 'TWO_FACTOR_NOT_ON');
    let method: SecondStep | null = null;
    if (/^\d{6}$/.test(input)) method = (await useAuthenticatorCode(c, userId, row, input)) ? 'authenticator' : null;
    else if (looksLikeRecoveryCode(input)) method = (await useRecoveryCode(c, userId, input)) ? 'recovery_code' : null;
    if (!method) return null;
    const left = Number((await c.query(`SELECT COUNT(*) AS n FROM user_recovery_codes WHERE user_id = $1 AND used_at IS NULL`, [userId])).rows[0].n);
    if (method === 'recovery_code') {
      await writeAuditTx(c, { userId, action: 'two_factor_recovery_code_used', performedBy: userId, ip, newValue: { ...context, recovery_codes_left: left } });
    }
    return { method, recoveryCodesLeft: left };
  });
  if (!res) return wrongCode(userId, ip, context);
  await clearWrongCodes(userId);
  return res;
}

async function assertPassword(userId: string, password: string, ip: string | null, action: string) {
  const u = await signInUser(userId);
  if (!u.password_hash || !(await bcrypt.compare(String(password ?? ''), u.password_hash))) {
    await writeAudit({ userId, action: 'two_factor_failed', performedBy: userId, ip, newValue: { stage: action, reason: 'password' } });
    throw new AppError('Your password is not right', 400, true, 'PASSWORD_WRONG');
  }
  return u;
}

/** Switch it off (only where it is optional): the password and a current code. */
export async function disableTwoFactor(userId: string, password: string, code: string, ip: string | null) {
  const u = await assertPassword(userId, password, ip, 'disable');
  if (!mayDisable(u.role, await twoFactorPolicy())) {
    throw new AppError('Two-step sign-in is required for your login and cannot be switched off', 409, true, 'TWO_FACTOR_REQUIRED');
  }
  await checkSecondStep(userId, code, ip, { stage: 'disable' });
  await withTransaction(async (c) => {
    await c.query(`DELETE FROM user_recovery_codes WHERE user_id = $1`, [userId]);
    await c.query(`DELETE FROM user_two_factor WHERE user_id = $1`, [userId]);
    await writeAuditTx(c, { userId, action: 'two_factor_disabled', performedBy: userId, ip });
  });
}

/** Ten new recovery codes (the old ones stop working): the password and a current code. */
export async function regenerateRecoveryCodes(userId: string, password: string, code: string, ip: string | null): Promise<string[]> {
  await assertPassword(userId, password, ip, 'recovery_codes');
  await checkSecondStep(userId, code, ip, { stage: 'recovery_codes' });
  return withTransaction(async (c) => {
    const codes = await newRecoveryCodesTx(c, userId);
    await writeAuditTx(c, { userId, action: 'two_factor_recovery_codes_renewed', performedBy: userId, ip, newValue: { recovery_codes: codes.length } });
    return codes;
  });
}

/** What the person's own security page shows. */
export async function twoFactorStatus(userId: string, role: string) {
  const policy = await twoFactorPolicy();
  const row = await queryOne<{ status: string; confirmed_at: string | null; codes_left: number }>(
    `SELECT t.status, t.confirmed_at,
            (SELECT COUNT(*) FROM user_recovery_codes r WHERE r.user_id = t.user_id AND r.used_at IS NULL)::int AS codes_left
     FROM user_two_factor t WHERE t.user_id = $1`, [userId]);
  const applies = appliesToRole(role);
  return {
    applies, policy, required: applies && policy === 'required',
    enrolled: row?.status === 'active', confirmed_at: row?.status === 'active' ? row.confirmed_at : null,
    recovery_codes_left: row?.status === 'active' ? row.codes_left : 0, recovery_codes_total: RECOVERY_CODE_COUNT,
    may_disable: row?.status === 'active' && mayDisable(role, policy),
  };
}

// ── Admins ─────────────────────────────────────────────────────────────────

/** Staff and partner logins with their two-step sign-in state (names and roles only, no mobiles — C-41). */
export async function twoFactorOverview() {
  const policy = await twoFactorPolicy();
  const people = await query<any>(
    `SELECT u.id AS user_id, COALESCE(up.full_name, 'Staff member') AS full_name, u.role, u.is_active, v.name AS partner_name,
            t.status = 'active' AS enrolled, CASE WHEN t.status = 'active' THEN t.confirmed_at END AS enrolled_at,
            (SELECT COUNT(*) FROM user_recovery_codes r WHERE r.user_id = u.id AND r.used_at IS NULL)::int AS recovery_codes_left
     FROM users u
     LEFT JOIN user_profiles up ON up.user_id = u.id
     LEFT JOIN user_two_factor t ON t.user_id = u.id
     LEFT JOIN vendor_users vu ON vu.user_id = u.id LEFT JOIN vendors v ON v.id = vu.vendor_id
     WHERE u.role = ANY($1) AND u.deleted_at IS NULL
     ORDER BY u.is_active DESC, (t.status = 'active') NULLS FIRST, u.role, up.full_name LIMIT 1000`, [[...TWO_FACTOR_ROLES]]);
  return { policy, people: people.map((p) => ({ ...p, enrolled: !!p.enrolled })) };
}

/** A super-admin removes another login's authenticator (lost phone): it is set up again at next sign-in when required. */
export async function resetTwoFactor(actorId: string, targetId: string, reason: string, ip: string | null) {
  if (actorId === targetId) throw new AppError('Use your own security page to change your two-step sign-in', 400);
  const target = await queryOne<{ id: string; role: string }>(`SELECT id, role FROM users WHERE id = $1 AND deleted_at IS NULL`, [targetId]);
  if (!target) throw new AppError('Account not found', 404);
  const removed = await withTransaction(async (c) => {
    const r = await c.query(`DELETE FROM user_two_factor WHERE user_id = $1 RETURNING status`, [targetId]);
    await c.query(`DELETE FROM user_recovery_codes WHERE user_id = $1`, [targetId]);
    if (!r.rowCount) return false;
    await writeAuditTx(c, { userId: targetId, action: 'two_factor_reset_by_admin', performedBy: actorId, ip, notes: reason,
      newValue: { role: target.role, was: r.rows[0].status } });
    return true;
  });
  if (!removed) throw new AppError('This login has no two-step sign-in to reset', 409, true, 'TWO_FACTOR_NOT_ON');
  await clearWrongCodes(targetId);
  return { user_id: targetId, reset: true };
}
