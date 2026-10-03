// Doctor / institution buyers: their council registration, verified by Dawabag staff
// (Sprint 44; Drugs Rules 1945 r.65(9)(b); FDA Maharashtra (Pune Division) circular No.
// Drug/Wholesalers Memo./16/2026/1 dated 30-09-2026 — never supply an unqualified or
// unauthorised "doctor"; keep a copy of the doctor's valid registration certificate).
//
// Reuses what exists: users.nmc_* (registration number, council, name as on the register —
// Sprint 1 KYC), kyc_documents 'nmc_certificate' (the uploaded copy, private object store),
// kyc_verifications 'nmc_registration' (the check, via NMCVerifier), and party_licences
// (Sprint 30) for an institution's own registration / licence. Sprint 44 adds the status
// (verified / rejected / suspended), the valid-till date and the key of the certificate copy
// that was checked, so the copy shown with a sale is the one verified.
import { PoolClient } from 'pg';
import { pool, queryOne } from '../../config/database';
import { AppError } from '../../utils/AppError';
import { writeAudit } from '../../utils/audit';
import { todayIST } from '../../utils/ist';
import { listLicences } from '../licences/register.service';
import { KYCOrchestrator, NMCVerifier } from '../kyc.service';
import {
  InstitutionLicence, PRACTITIONER_TYPE, PractitionerSnapshot, REGISTRATION_INVALID, RegistrationRow, Standing,
  kindOf, practitionerSnapshot, registrationStanding,
} from './rules';

type Q = Pick<PoolClient, 'query'>;

const ROW_SQL = `
  SELECT u.id, u.customer_type, u.kyc_status, u.practitioner_kind, u.nmc_reg_number, u.nmc_council_state, u.nmc_status,
         to_char(u.nmc_valid_till, 'YYYY-MM-DD') AS nmc_valid_till, u.nmc_certificate_key, u.nmc_verified_at,
         u.nmc_doctor_name_as_per_register, u.nmc_status_note, u.business_name, up.full_name
  FROM users u LEFT JOIN user_profiles up ON up.user_id = u.id WHERE u.id = $1`;

export interface PractitionerState {
  applies: boolean;
  row: (RegistrationRow & { id: string; customer_type: string; kyc_status: string | null; nmc_status_note: string | null }) | null;
  institutionLicences: InstitutionLicence[];
  standing: Standing | null;
  snapshot: PractitionerSnapshot | null;
}

async function institutionLicencesOf(db: Q | null, userId: string): Promise<InstitutionLicence[]> {
  return (await listLicences({ userId }, db ? { client: db } : {}))
    .map((l) => ({ label: l.label, number: l.licence_number, valid_upto: l.valid_upto, status: l.status }));
}

/** Where a buyer stands as a doctor / institution (applies = false for every other buyer). */
export async function practitionerState(db: Q | null, userId: string): Promise<PractitionerState> {
  const row = db ? (await db.query(ROW_SQL, [userId])).rows[0] : await queryOne<any>(ROW_SQL, [userId]);
  if (!row || row.customer_type !== PRACTITIONER_TYPE) return { applies: false, row: row ?? null, institutionLicences: [], standing: null, snapshot: null };
  const lic = kindOf(row) === 'institution' ? await institutionLicencesOf(db, userId) : [];
  return { applies: true, row, institutionLicences: lic, standing: registrationStanding(row, todayIST(), lic), snapshot: practitionerSnapshot(row, lic) };
}

/** Refuses a sale to a doctor / institution whose registration is not verified and in date (403, plain reason). */
export async function assertMaySellToPractitioner(db: Q, userId: string): Promise<PractitionerState> {
  const s = await practitionerState(db, userId);
  if (s.applies && !s.standing!.ok) throw new AppError(s.standing!.message, 403, true, REGISTRATION_INVALID);
  return s;
}

/** GET /users/me/practitioner-registration — what the doctor sees (web and app). */
export async function myRegistration(userId: string) {
  const s = await practitionerState(null, userId);
  if (!s.applies || !s.row) return { applies: false };
  const cert = await queryOne<{ uploaded_at: string }>(
    `SELECT uploaded_at FROM kyc_documents WHERE user_id = $1 AND document_type = 'nmc_certificate'`, [userId]);
  return {
    applies: true,
    kind: kindOf(s.row),
    registration_number: s.row.nmc_reg_number,
    council: s.row.nmc_council_state,
    name_as_per_register: s.row.nmc_doctor_name_as_per_register,
    status: s.row.nmc_status ?? 'pending',
    valid_till: s.row.nmc_valid_till,
    certificate_uploaded: !!cert,
    certificate_uploaded_at: cert?.uploaded_at ?? null,
    institution: kindOf(s.row) === 'institution' ? { name: s.row.business_name, licences: s.institutionLicences } : null,
    can_order: s.standing!.ok,
    message: s.standing!.message,
    written_order_required: true,
  };
}

export interface RegistrationDecision {
  decision: 'verify' | 'reject' | 'suspend';
  registration_number: string;
  council: string;
  /** YYYY-MM-DD, required to verify (and in the future) */
  valid_till?: string | null;
  name_as_per_register?: string | null;
  qualification?: string | null;
  kind?: 'doctor' | 'institution';
  reason?: string | null;
  notes?: string | null;
}

/**
 * A staff member's decision on the registration. Verifying needs the valid-till date and a
 * certificate copy on file; the copy checked is the one kept with every later sale.
 */
export async function decideRegistration(adminId: string, userId: string, d: RegistrationDecision) {
  const user = await queryOne<{ customer_type: string }>(`SELECT customer_type FROM users WHERE id = $1 AND deleted_at IS NULL`, [userId]);
  if (!user) throw new AppError('User not found', 404);
  if (user.customer_type !== PRACTITIONER_TYPE) throw new AppError('Only doctor / hospital accounts have a medical council registration', 400);
  if (!d.registration_number?.trim() || !d.council?.trim()) throw new AppError('Registration number and council are required', 400);
  const cert = await queryOne<{ storage_key: string }>(
    `SELECT storage_key FROM kyc_documents WHERE user_id = $1 AND document_type = 'nmc_certificate'`, [userId]);
  if (d.decision === 'verify') {
    if (!d.valid_till || !/^\d{4}-\d{2}-\d{2}$/.test(d.valid_till)) {
      throw new AppError("Enter until when the registration is valid (as on the certificate or the council's register)", 400);
    }
    if (d.valid_till < todayIST()) throw new AppError('This registration has lapsed; it cannot be verified as valid', 400);
    if (!cert) {
      throw new AppError('No copy of the registration certificate has been uploaded. Ask the doctor to upload it first (FDA circular: keep a copy of the registration).',
        409, true, 'CERTIFICATE_MISSING');
    }
  } else if (!d.reason || d.reason.trim().length < 5) {
    throw new AppError(d.decision === 'suspend' ? 'Say why the registration is suspended' : 'Say why the registration could not be verified', 400);
  }

  // The kyc_verifications row and the old flags (the KYC approval reads them). A suspension
  // keeps the account as it is: the registration gate itself stops every sale (and says why).
  if (d.decision !== 'suspend') await NMCVerifier.recordAdminVerification({
    userId, nmcNumber: d.registration_number.trim(), councilState: d.council.trim(), verified: d.decision === 'verify',
    doctorNameAsPerRegister: d.name_as_per_register?.trim() || undefined, qualification: d.qualification?.trim() || undefined,
    registrationStatus: d.decision, rejectionReason: d.decision === 'reject' ? d.reason!.trim() : undefined, adminId,
    notes: d.notes?.trim() || undefined,
  });
  await pool.query(
    `UPDATE users SET nmc_reg_number = $2, nmc_council_state = $3, nmc_status = $4::varchar,
            nmc_valid_till = CASE WHEN $4::varchar = 'verified' THEN $5::date ELSE nmc_valid_till END,
            nmc_verified_by = $6, nmc_verified_at = NOW(),
            nmc_certificate_key = CASE WHEN $4::varchar = 'verified' THEN $7::varchar ELSE nmc_certificate_key END,
            nmc_status_note = $8, practitioner_kind = COALESCE($9::varchar, practitioner_kind, 'doctor'),
            nmc_reg_verified = ($4::varchar = 'verified'), updated_at = NOW()
     WHERE id = $1`,
    [userId, d.registration_number.trim().slice(0, 50), d.council.trim().slice(0, 50),
     d.decision === 'verify' ? 'verified' : d.decision === 'suspend' ? 'suspended' : 'rejected',
     d.valid_till ?? null, adminId, cert?.storage_key ?? null, (d.reason ?? d.notes ?? '').trim().slice(0, 1000) || null, d.kind ?? null]);
  await writeAudit({ userId, action: `practitioner_registration_${d.decision === 'verify' ? 'verified' : d.decision === 'suspend' ? 'suspended' : 'rejected'}`,
    performedBy: adminId, newValue: { registration_number: d.registration_number.trim(), council: d.council.trim(), valid_till: d.valid_till ?? null,
      certificate_checked: !!cert && d.decision === 'verify', kind: d.kind ?? null }, notes: d.reason ?? d.notes ?? undefined });
  const activated = d.decision === 'verify' ? await KYCOrchestrator.checkAndActivate(userId, adminId) : false;
  return { verified: d.decision === 'verify', status: d.decision === 'verify' ? 'verified' : d.decision === 'suspend' ? 'suspended' : 'rejected',
    account_activated: activated, registration: await myRegistration(userId) };
}

/** Admin list: doctor / institution accounts with where their registration stands (re-verification work list). */
export async function listPractitioners(filter: 'attention' | 'all' = 'attention') {
  const rows = (await pool.query(
    `SELECT u.id FROM users u WHERE u.customer_type = $1 AND u.deleted_at IS NULL ORDER BY u.created_at DESC LIMIT 500`, [PRACTITIONER_TYPE])).rows;
  const out = [];
  for (const r of rows) {
    const s = await practitionerState(null, r.id);
    if (!s.row) continue;
    if (filter === 'attention' && s.standing!.ok) continue;
    const cert = await queryOne<{ id: string; uploaded_at: string }>(
      `SELECT id, uploaded_at FROM kyc_documents WHERE user_id = $1 AND document_type = 'nmc_certificate'`, [r.id]);
    out.push({
      user_id: r.id, name: s.row.full_name, business_name: s.row.business_name, kind: kindOf(s.row), kyc_status: s.row.kyc_status,
      registration_number: s.row.nmc_reg_number, council: s.row.nmc_council_state, name_as_per_register: s.row.nmc_doctor_name_as_per_register,
      status: s.row.nmc_status ?? 'pending', valid_till: s.row.nmc_valid_till, note: s.row.nmc_status_note,
      certificate_document_id: cert?.id ?? null, certificate_uploaded_at: cert?.uploaded_at ?? null,
      can_order: s.standing!.ok, message: s.standing!.message,
    });
  }
  return out;
}
