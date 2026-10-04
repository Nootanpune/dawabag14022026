// src/services/pharmacistCheck/partner.service.ts — a partner's shipments are checked
// and released by the partner's own registered pharmacist (Sprint 35 decision: the
// competent person on the partner's drug licence; Sprint 28 vendor_pharmacists).
// Partner logins are business logins, so the login records WHICH of its registered
// pharmacists made the check; the name and registration number go on the shipment and
// in the audit log (C-08, C-46).
import { PoolClient } from 'pg';
import { query } from '../../config/database';
import { AppError } from '../../utils/AppError';
import { CheckDecision } from './rules';
import { Checker, assertCheckable, decide, lockOrderOfShipment } from './check.service';
import { assertPartnerRegistrationValid } from '../pharmacistRegistration/gate.service';
import { registrationStanding } from '../pharmacistRegistration/rules';
import { todayIST } from '../../utils/ist';

/** The partner's active pharmacists, each with where its registration stands (Sprint 39). */
export async function partnerPharmacists(vendorId: string) {
  const rows = await query<any>(
    `SELECT id, full_name, registration_no, state_council, to_char(valid_till, 'YYYY-MM-DD') AS valid_till, registration_status,
            verified_at, recorded_before_sprint39
     FROM vendor_pharmacists WHERE vendor_id = $1 AND is_active ORDER BY full_name`, [vendorId]);
  const today = todayIST();
  return rows.map((r) => {
    const st = registrationStanding({ ...r, status: r.registration_status }, null, today, `${r.full_name}'s`);
    return { id: r.id, full_name: r.full_name, registration_no: r.registration_no, state_council: r.state_council, valid_till: r.valid_till,
      registration_status: r.registration_status, verified: !!r.verified_at,
      registration: { ok: st.ok, state: st.state, message: st.message } };
  });
}

async function partnerChecker(client: PoolClient, vendorId: string, vendorPharmacistId: string, userId: string): Promise<Checker> {
  const p = (await client.query(
    `SELECT id, full_name, registration_no FROM vendor_pharmacists WHERE id = $1 AND vendor_id = $2 AND is_active`,
    [vendorPharmacistId, vendorId])).rows[0];
  if (!p) throw new AppError('Choose one of your registered pharmacists (ask Dawabag to add a pharmacist to your account)', 400);
  // Sprint 39: lapsed, expired, suspended or unverified registrations cannot release (C-03, C-08)
  await assertPartnerRegistrationValid(client, p.id);
  return { userId, name: p.full_name, regNo: p.registration_no, vendorPharmacistId: p.id };
}

export function decidePartnerShipment(
  vendorId: string, userId: string, shipmentId: string,
  input: { decision: CheckDecision; vendor_pharmacist_id: string; reason?: string; edits_seen?: number },
) {
  return decide(
    async (client) => {
      await lockOrderOfShipment(client, shipmentId, vendorId);   // Sprint 48: order first, as an order change
      const s = (await client.query(
        `SELECT s.id, s.order_id, s.status, s.pharmacist_check, o.status AS order_status, o.order_number, o.user_id
         FROM order_shipments s JOIN orders o ON o.id = s.order_id
         WHERE s.id = $1 AND s.partner_id = $2 FOR UPDATE OF s`, [shipmentId, vendorId])).rows[0];
      if (!s) throw new AppError('Shipment not found', 404);
      // Partners pack and dispatch in one step: 'pending' and 'packed' are both still at the partner
      assertCheckable({ ...s, status: s.status === 'packed' ? 'pending' : s.status }, 'partner');
      return s;
    },
    (client) => partnerChecker(client, vendorId, input.vendor_pharmacist_id, userId),
    input.decision, input.reason, userId, { editsSeen: input.edits_seen });
}
