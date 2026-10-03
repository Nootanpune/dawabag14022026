// Recording and verifying pharmacist registrations (Sprint 39, rules.ts). Admins
// (admin, super_admin) record a Dawabag pharmacist's or a partner pharmacist's State
// Pharmacy Council, registration number, valid-till and status, and mark it verified
// after checking the council's register. Every change is audited with before / after
// (C-46). Changing the council, number or validity without re-verifying clears the
// verification, so a stale "verified" can never cover new details.
import { PoolClient } from 'pg';
import { query, withTransaction } from '../../config/database';
import { AppError } from '../../utils/AppError';
import { writeAuditTx } from '../../utils/audit';
import { todayIST } from '../../utils/ist';
import { RegistrationInput, registrationInputProblems, registrationStanding } from './rules';

const fail = (problems: string[]) => { if (problems.length) throw new AppError(problems.join('; '), 400); };
const clean = (v: string | null | undefined) => (v == null ? null : String(v).trim() || null);

/** Every Dawabag pharmacist (pharmacist_rx) and every partner pharmacist, with standing. */
export async function listRegistrations() {
  const today = todayIST();
  const staff = await query<any>(
    `SELECT u.id AS user_id, up.full_name, u.mobile, u.pharmacist_reg_no, u.is_active,
            r.state_council, r.registration_no, to_char(r.valid_till, 'YYYY-MM-DD') AS valid_till, r.status, r.status_note,
            r.verified_at, vb.full_name AS verified_by_name, r.recorded_before_sprint39, r.updated_at
     FROM users u LEFT JOIN user_profiles up ON up.user_id = u.id
     LEFT JOIN pharmacist_registrations r ON r.user_id = u.id
     LEFT JOIN user_profiles vb ON vb.user_id = r.verified_by
     WHERE u.role = 'pharmacist_rx' AND u.deleted_at IS NULL ORDER BY up.full_name NULLS LAST`);
  const partners = await query<any>(
    `SELECT vp.id, vp.vendor_id, v.name AS partner_name, vp.full_name, vp.registration_no, vp.state_council,
            to_char(vp.valid_till, 'YYYY-MM-DD') AS valid_till, vp.registration_status AS status, vp.status_note, vp.verified_at,
            vb.full_name AS verified_by_name, vp.recorded_before_sprint39, vp.is_active
     FROM vendor_pharmacists vp JOIN vendors v ON v.id = vp.vendor_id
     LEFT JOIN user_profiles vb ON vb.user_id = vp.verified_by
     WHERE vp.is_active ORDER BY v.name, vp.full_name`);
  return {
    staff: staff.map((s) => ({ ...s, standing: registrationStanding(s.status ? s : null, s.pharmacist_reg_no, today, `${s.full_name || 'This pharmacist'}'s`) })),
    partners: partners.map((p) => ({ ...p, standing: registrationStanding(p, null, today, `${p.full_name}'s`) })),
  };
}

export interface StaffRegistrationIn extends RegistrationInput { status_note?: string | null }

/** PUT /admin/pharmacist-registrations/staff/:userId — also sets the login's registration number. */
export async function saveStaffRegistration(adminId: string, userId: string, input: StaffRegistrationIn) {
  const today = todayIST();
  return withTransaction(async (c: PoolClient) => {
    const u = (await c.query(`SELECT id, role, pharmacist_reg_no FROM users WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, [userId])).rows[0];
    if (!u || u.role !== 'pharmacist_rx') throw new AppError('Pharmacist account not found', 404);
    const before = (await c.query(`SELECT *, to_char(valid_till, 'YYYY-MM-DD') AS valid_till FROM pharmacist_registrations WHERE user_id = $1 FOR UPDATE`, [userId])).rows[0];
    const next = {
      state_council: input.state_council !== undefined ? clean(input.state_council) : before?.state_council ?? null,
      registration_no: (input.registration_no !== undefined ? clean(input.registration_no) : before?.registration_no ?? u.pharmacist_reg_no)?.toUpperCase() ?? null,
      valid_till: input.valid_till !== undefined ? input.valid_till || null : before?.valid_till ?? null,
      status: input.status ?? before?.status ?? 'active',
      status_note: input.status_note !== undefined ? clean(input.status_note) : before?.status_note ?? null,
    };
    if (!next.registration_no) throw new AppError('Enter the registration number', 400);
    fail(registrationInputProblems({ ...next, verified: input.verified }, today));
    const detailsChanged = !before || ['state_council', 'registration_no', 'valid_till'].some((k) => (before as any)[k] !== (next as any)[k]);
    const verified = input.verified ? true : detailsChanged ? false : !!before?.verified_at;
    await c.query(
      `INSERT INTO pharmacist_registrations (user_id, state_council, registration_no, valid_till, status, status_note, verified_by, verified_at,
         last_alert_days, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $7 THEN $8::uuid END, CASE WHEN $7 THEN NOW() END, NULL, $8, NOW())
       ON CONFLICT (user_id) DO UPDATE SET state_council = EXCLUDED.state_council, registration_no = EXCLUDED.registration_no,
         valid_till = EXCLUDED.valid_till, status = EXCLUDED.status, status_note = EXCLUDED.status_note,
         verified_by = CASE WHEN $9 THEN EXCLUDED.verified_by WHEN $7 THEN pharmacist_registrations.verified_by END,
         verified_at = CASE WHEN $9 THEN EXCLUDED.verified_at WHEN $7 THEN pharmacist_registrations.verified_at END,
         -- a renewal starts the reminders afresh
         last_alert_days = CASE WHEN EXCLUDED.valid_till IS DISTINCT FROM pharmacist_registrations.valid_till THEN NULL
                                ELSE pharmacist_registrations.last_alert_days END,
         updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
      [userId, next.state_council, next.registration_no, next.valid_till, next.status, next.status_note, verified, adminId, !!input.verified]);
    if (u.pharmacist_reg_no !== next.registration_no) {
      await c.query(`UPDATE users SET pharmacist_reg_no = $2, updated_at = NOW() WHERE id = $1`, [userId, next.registration_no]);
    }
    await writeAuditTx(c, { userId, action: input.verified ? 'pharmacist_registration_verified' : 'pharmacist_registration_recorded', performedBy: adminId,
      oldValue: before ? { state_council: before.state_council, registration_no: before.registration_no, valid_till: before.valid_till,
        status: before.status, verified: !!before.verified_at } : null,
      newValue: { ...next, verified } });
    return { user_id: userId, ...next, verified, standing: registrationStanding(
      { ...next, verified_at: verified ? new Date() : null, recorded_before_sprint39: !!before?.recorded_before_sprint39 }, next.registration_no, today) };
  });
}

/** PUT /admin/pharmacist-registrations/partner/:id — a partner pharmacist's details (the number stays: past H1 entries name it). */
export async function savePartnerRegistration(adminId: string, vendorPharmacistId: string, input: StaffRegistrationIn & { full_name?: string }) {
  const today = todayIST();
  return withTransaction(async (c: PoolClient) => {
    const before = (await c.query(
      `SELECT *, to_char(valid_till, 'YYYY-MM-DD') AS valid_till FROM vendor_pharmacists WHERE id = $1 FOR UPDATE`, [vendorPharmacistId])).rows[0];
    if (!before) throw new AppError('Partner pharmacist not found', 404);
    if (input.registration_no != null && clean(input.registration_no)?.toUpperCase() !== before.registration_no) {
      throw new AppError('The registration number cannot be changed (past register entries name it): add the pharmacist again with the new number', 400);
    }
    const next = {
      full_name: input.full_name !== undefined ? clean(input.full_name) ?? before.full_name : before.full_name,
      state_council: input.state_council !== undefined ? clean(input.state_council) : before.state_council,
      valid_till: input.valid_till !== undefined ? input.valid_till || null : before.valid_till,
      status: input.status ?? before.registration_status,
      status_note: input.status_note !== undefined ? clean(input.status_note) : before.status_note,
    };
    fail(registrationInputProblems({ ...next, registration_no: before.registration_no, verified: input.verified }, today));
    const detailsChanged = ['state_council', 'valid_till'].some((k) => (before as any)[k] !== (next as any)[k]);
    const verified = input.verified ? true : detailsChanged ? false : !!before.verified_at;
    await c.query(
      `UPDATE vendor_pharmacists SET full_name = $2, state_council = $3, valid_till = $4, registration_status = $5, status_note = $6,
         verified_by = CASE WHEN $8 THEN $7::uuid WHEN $9 THEN verified_by END,
         verified_at = CASE WHEN $8 THEN NOW() WHEN $9 THEN verified_at END,
         last_alert_days = CASE WHEN $4::date IS DISTINCT FROM valid_till THEN NULL ELSE last_alert_days END, updated_at = NOW()
       WHERE id = $1`,
      [vendorPharmacistId, next.full_name, next.state_council, next.valid_till, next.status, next.status_note, adminId, !!input.verified, verified]);
    await writeAuditTx(c, { userId: null, action: input.verified ? 'partner_pharmacist_registration_verified' : 'partner_pharmacist_registration_recorded',
      performedBy: adminId,
      oldValue: { full_name: before.full_name, state_council: before.state_council, valid_till: before.valid_till, status: before.registration_status, verified: !!before.verified_at },
      newValue: { vendor_id: before.vendor_id, vendor_pharmacist_id: vendorPharmacistId, registration_no: before.registration_no, ...next, verified } });
    return { id: vendorPharmacistId, registration_no: before.registration_no, ...next, verified,
      standing: registrationStanding({ ...next, registration_no: before.registration_no, verified_at: verified ? new Date() : null,
        recorded_before_sprint39: before.recorded_before_sprint39 }, null, today, `${next.full_name}'s`) };
  });
}
