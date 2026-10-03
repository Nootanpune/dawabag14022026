// The pharmacist of record's registration as at the check (Sprint 42): kept on the shipment
// with the release or refusal, filled once and then final (migration 37). Registers and
// invoices read this snapshot, not the registration row as it is later (C-03, C-08, C-46).
import { PoolClient } from 'pg';
import { registrationSnapshot, RegistrationSnapshot } from './rules';

type Q = Pick<PoolClient, 'query'>;

export async function staffRegistrationAtCheck(db: Q, userId: string, regNo: string): Promise<RegistrationSnapshot> {
  const r = (await db.query(
    `SELECT state_council, to_char(valid_till, 'YYYY-MM-DD') AS valid_till, status, verified_at
     FROM pharmacist_registrations WHERE user_id = $1`, [userId])).rows[0];
  return registrationSnapshot('staff', regNo, r);
}

export async function partnerRegistrationAtCheck(db: Q, vendorPharmacistId: string, regNo: string): Promise<RegistrationSnapshot> {
  const r = (await db.query(
    `SELECT state_council, to_char(valid_till, 'YYYY-MM-DD') AS valid_till, registration_status AS status, verified_at
     FROM vendor_pharmacists WHERE id = $1`, [vendorPharmacistId])).rows[0];
  return registrationSnapshot('partner', regNo, r);
}
