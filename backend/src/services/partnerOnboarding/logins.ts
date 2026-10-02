// Partner portal logins created by Dawabag's admin (Sprint 28). The admin chooses a
// temporary password and hands it over; the login must replace it at first sign-in
// (users.must_change_password, enforced by auth.middleware). The password itself is
// never logged or written to the audit trail (C-41, C-46).
import bcrypt from 'bcryptjs';
import { PoolClient } from 'pg';
import { AppError } from '../../utils/AppError';
import { writeAuditTx } from '../../utils/audit';
import { passwordProblem } from '../../utils/passwordPolicy';

export interface LoginIn {
  mobile: string;
  full_name?: string | null;
  temporary_password: string;
}

export interface LoginOut {
  user_id: string;
  mobile: string;
  /** false when an existing, unlinked partner login was linked and keeps its own password */
  temporary_password_set: boolean;
}

const masked = (mobile: string) => `+91 ${mobile.slice(0, 2)}xxxxxx${mobile.slice(-2)}`;

/**
 * Creates the login (role partner, mobile verified by the admin who onboarded the
 * partner, temporary password to be changed) or links an existing partner login that
 * belongs to no partner yet. A mobile that already belongs to a buyer, doctor or staff
 * account is refused in plain words — roles are never changed silently.
 */
export async function addPartnerLoginTx(client: PoolClient, vendorId: string, adminId: string, input: LoginIn,
  fallbackName: string): Promise<LoginOut> {
  const mobile = input.mobile.trim();
  const existing = (await client.query(
    `SELECT u.id, u.role, u.deleted_at, vu.vendor_id
     FROM users u LEFT JOIN vendor_users vu ON vu.user_id = u.id
     WHERE u.mobile = $1 FOR UPDATE OF u`, [mobile])).rows[0];

  if (existing) {
    if (existing.deleted_at) throw new AppError(`${masked(mobile)} belonged to a closed account and cannot be reused; use another mobile number`, 409);
    if (existing.role !== 'partner') {
      const what = existing.role === 'customer' ? 'a Dawabag customer account' : 'a Dawabag staff or doctor account';
      throw new AppError(`${masked(mobile)} is already registered to ${what}. A partner login needs its own mobile number — use a different number for this person.`, 409);
    }
    if (existing.vendor_id === vendorId) throw new AppError(`${masked(mobile)} is already a login for this partner`, 409);
    if (existing.vendor_id) throw new AppError(`${masked(mobile)} is already the login of another partner`, 409);
    // A partner login that lost its link (e.g. earlier unlinked): link it, keep its password
    await client.query(`INSERT INTO vendor_users (vendor_id, user_id, created_by) VALUES ($1, $2, $3)`, [vendorId, existing.id, adminId]);
    await writeAuditTx(client, { userId: existing.id, action: 'partner_login_linked', performedBy: adminId,
      newValue: { vendor_id: vendorId, user_id: existing.id } });
    return { user_id: existing.id, mobile, temporary_password_set: false };
  }

  const problem = passwordProblem(input.temporary_password, mobile);
  if (problem) throw new AppError(`Temporary password for ${masked(mobile)}: ${problem}`, 400);
  const hash = await bcrypt.hash(input.temporary_password, parseInt(process.env.BCRYPT_ROUNDS || '12'));
  // Business login: no buyer KYC; the admin vouches for the mobile number when onboarding
  const user = (await client.query<{ id: string }>(
    `INSERT INTO users (mobile, password_hash, role, customer_type, kyc_status, mobile_verified, must_change_password)
     VALUES ($1, $2, 'partner', 'customer', 'not_required', TRUE, TRUE) RETURNING id`, [mobile, hash])).rows[0];
  await client.query(`INSERT INTO user_profiles (user_id, full_name) VALUES ($1, $2)`,
    [user.id, (input.full_name || '').trim() || fallbackName]);
  await client.query(`INSERT INTO vendor_users (vendor_id, user_id, created_by) VALUES ($1, $2, $3)`, [vendorId, user.id, adminId]);
  // C-46: who created which login for which partner — never the password
  await writeAuditTx(client, { userId: user.id, action: 'partner_login_created', performedBy: adminId,
    newValue: { vendor_id: vendorId, user_id: user.id, must_change_password: true } });
  return { user_id: user.id, mobile, temporary_password_set: true };
}
