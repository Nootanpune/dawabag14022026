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
import { Checker, assertCheckable, decide } from './check.service';

export function partnerPharmacists(vendorId: string) {
  return query<any>(
    `SELECT id, full_name, registration_no FROM vendor_pharmacists WHERE vendor_id = $1 AND is_active ORDER BY full_name`, [vendorId]);
}

async function partnerChecker(client: PoolClient, vendorId: string, vendorPharmacistId: string, userId: string): Promise<Checker> {
  const p = (await client.query(
    `SELECT id, full_name, registration_no FROM vendor_pharmacists WHERE id = $1 AND vendor_id = $2 AND is_active`,
    [vendorPharmacistId, vendorId])).rows[0];
  if (!p) throw new AppError('Choose one of your registered pharmacists (ask Dawabag to add a pharmacist to your account)', 400);
  return { userId, name: p.full_name, regNo: p.registration_no, vendorPharmacistId: p.id };
}

export function decidePartnerShipment(
  vendorId: string, userId: string, shipmentId: string,
  input: { decision: CheckDecision; vendor_pharmacist_id: string; reason?: string },
) {
  return decide(
    async (client) => {
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
    input.decision, input.reason, userId);
}
