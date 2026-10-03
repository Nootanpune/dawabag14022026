// Writes the Schedule H1 register inside the dispatch transaction (C-09), for
// Dawabag's and partners' shipments alike. Every entry must be complete — a missing
// detail throws a plain 409 and the whole dispatch rolls back; the database checks the
// same (constraint h1_register_complete). The entry goes to the register of the
// seller's licence; its number and hash are set when the dispatch commits
// (migration 33, h1_register_seal). Sprint 42: the licence is the one the line was SOLD
// under, frozen at the sale (order_items.sale_licence_*), and the pharmacist is the one
// recorded on the shipment at the check — never the registers as they are later.
import { PoolClient } from 'pg';
import { AppError } from '../../utils/AppError';
import { dawabagDrugLicences, listLicences } from '../licences/register.service';
import { H1Draft, LicenceRef, h1RefusalMessage, registerKey, registerLicence } from './entry';

/** The seller's licences as printed on the shipment's invoice (C-13), else as on file now. */
async function sellerLicences(client: PoolClient, s: { seller_type: string; partner_id: string | null; seller_drug_licences: any }): Promise<LicenceRef[]> {
  const snap = Array.isArray(s.seller_drug_licences) ? s.seller_drug_licences : [];
  if (snap.length) return snap.map((l: any) => ({ form: String(l.form ?? ''), number: String(l.number ?? '') }));
  if (s.seller_type === 'partner' && s.partner_id) {
    return (await listLicences({ vendorId: s.partner_id }, { client }))
      .filter((l) => l.status === 'verified').map((l) => ({ form: l.form, number: l.licence_number }));
  }
  return (await dawabagDrugLicences(client)).map((l) => ({ form: l.form, number: l.licence_number }));
}

export async function recordH1Dispensing(client: PoolClient, shipmentId: string): Promise<number> {
  const rows = (await client.query(
    `SELECT s.seller_type, s.partner_id, s.seller_drug_licences, o.id AS order_id, oi.id AS order_item_id, oi.product_id,
            oi.sale_licence_form, oi.sale_licence_number,
            oi.product_name, oi.quantity,
            COALESCE(ib.batch_number, pi.batch_number) AS batch_number,
            rx.id AS prescription_id, rx.patient_name, rx.prescriber_name, rx.prescriber_address, rx.prescriber_reg_no,
            COALESCE(s.pharmacist_name, pp.h1_pharmacist_name, vp.full_name) AS pharmacist_name,
            COALESCE(s.pharmacist_reg_no, pp.h1_pharmacist_reg_no, rx.pharmacist_reg_no) AS pharmacist_reg_no,
            concat_ws(', ', a.full_name, a.address_line1, a.address_line2, a.city, a.state, a.pincode) AS patient_address
     FROM order_shipments s
     JOIN orders o ON o.id = s.order_id
     JOIN addresses a ON a.id = o.address_id
     JOIN order_items oi ON oi.shipment_id = s.id
     JOIN products p ON p.id = oi.product_id AND p.drug_schedule = 'Schedule H1'
     LEFT JOIN prescriptions rx ON rx.id = oi.prescription_id
     LEFT JOIN inventory_batches ib ON ib.id = oi.batch_id
     LEFT JOIN partner_order_items poi ON poi.order_item_id = oi.id
     LEFT JOIN partner_inventory pi ON pi.id = poi.partner_inv_id
     LEFT JOIN partner_products pp ON pp.id = poi.partner_product_id
     LEFT JOIN user_profiles vp ON vp.user_id = rx.verified_by
     WHERE s.id = $1
       AND NOT EXISTS (SELECT 1 FROM h1_register h WHERE h.order_item_id = oi.id)
     ORDER BY oi.id`, [shipmentId])).rows;
  // Retail supply on prescription is what the register records (as before Sprint 38): a
  // licensed trade buyer's H1 line carries no prescription (C-11) and is on its tax invoice.
  // assertRxCleared has already refused dispatch of any retail line still without one.
  const lines = rows.filter((r) => r.prescription_id);
  if (!lines.length) return 0;

  const fallback = registerLicence(await sellerLicences(client, lines[0]));
  for (const r of lines) {
    // The licence this line was sold under (Sprint 42); shipments recorded without one use the snapshot's retail licence
    const lic: LicenceRef | null = r.sale_licence_number?.trim() ? { form: r.sale_licence_form, number: r.sale_licence_number } : fallback;
    const draft: H1Draft = { ...r, seller_licence_no: lic?.number ?? null };
    const refusal = h1RefusalMessage(draft, r.seller_type);
    if (refusal) throw new AppError(refusal, 409, true, 'H1_REGISTER_INCOMPLETE');
    await client.query(
      `INSERT INTO h1_register
         (seller_type, partner_id, register_key, seller_licence_no, order_id, order_item_id, product_id, product_name,
          batch_number, quantity, patient_name, patient_address, prescriber_name, prescriber_address, prescriber_reg_no,
          prescription_id, pharmacist_name, pharmacist_reg_no)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
      [r.seller_type, r.partner_id, registerKey(r.seller_type, r.partner_id, lic!.number), lic!.number.trim(),
       r.order_id, r.order_item_id, r.product_id, r.product_name, r.batch_number.trim(), r.quantity,
       r.patient_name.trim(), r.patient_address, r.prescriber_name.trim(), r.prescriber_address.trim(),
       r.prescriber_reg_no?.trim() || null, r.prescription_id, r.pharmacist_name.trim(), r.pharmacist_reg_no.trim()]);
  }
  return lines.length;
}
