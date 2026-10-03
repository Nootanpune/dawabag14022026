// The registration checks at the four gates (Sprint 39, rules.ts): prescription
// verification, the per-order pharmacist check, a partner's shipment release and
// medicine-information approval. Read inside the caller's transaction.
import { PoolClient } from 'pg';
import { AppError } from '../../utils/AppError';
import { todayIST } from '../../utils/ist';
import { RegistrationRecord, Standing, registrationStanding } from './rules';

type Q = Pick<PoolClient, 'query'>;

export const REGISTRATION_INVALID = 'PHARMACIST_REGISTRATION_INVALID';

const STAFF_SQL = `SELECT registration_no, state_council, to_char(valid_till, 'YYYY-MM-DD') AS valid_till, status, verified_at,
                          recorded_before_sprint39 FROM pharmacist_registrations WHERE user_id = $1`;
const PARTNER_SQL = `SELECT registration_no, state_council, to_char(valid_till, 'YYYY-MM-DD') AS valid_till, registration_status AS status,
                            verified_at, recorded_before_sprint39, full_name FROM vendor_pharmacists WHERE id = $1`;

/** A Dawabag pharmacist's standing today (their own login's registration number). */
export async function staffStanding(db: Q, userId: string, currentRegNo: string | null): Promise<Standing> {
  const r = (await db.query(STAFF_SQL, [userId])).rows[0] as RegistrationRecord | undefined;
  return registrationStanding(r ?? null, currentRegNo, todayIST());
}

export async function assertStaffRegistrationValid(db: Q, userId: string, currentRegNo: string | null): Promise<Standing> {
  const s = await staffStanding(db, userId, currentRegNo);
  if (!s.ok) throw new AppError(s.message ?? 'Your pharmacy council registration cannot be used', 403, true, REGISTRATION_INVALID);
  return s;
}

/** A partner's pharmacist (vendor_pharmacists row) standing today. */
export async function partnerStanding(db: Q, vendorPharmacistId: string): Promise<Standing> {
  const r = (await db.query(PARTNER_SQL, [vendorPharmacistId])).rows[0] as (RegistrationRecord & { full_name: string }) | undefined;
  return registrationStanding(r ?? null, null, todayIST(), r ? `${r.full_name}'s` : 'This pharmacist\'s');
}

export async function assertPartnerRegistrationValid(db: Q, vendorPharmacistId: string): Promise<Standing> {
  const s = await partnerStanding(db, vendorPharmacistId);
  if (!s.ok) throw new AppError(s.message ?? 'This pharmacist\'s registration cannot be used', 403, true, REGISTRATION_INVALID);
  return s;
}
