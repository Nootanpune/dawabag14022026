// src/scripts/demo/practice.ts — the demo doctor and the demo partner pharmacy.
// The doctor goes through the same services an admin and a doctor use: enabled,
// profile saved, registration "checked" and approved by the demo admin (C-22),
// then open slots over the next days at a ₹300 fee. The partner is an approved
// marketplace pharmacy with a licence in date, a few live listings at catalogue
// price and its own stock ledger (C-05, C-16, C-25).
import { PoolClient } from 'pg';
import { addSlots, decideDoctor, enableDoctor, saveProfile } from '../../services/telemedicine/doctor.service';
import { writeAuditTx } from '../../utils/audit';
import { DEMO_MEDICINES, DEMO_SKU_PREFIX } from './catalogueData';
import { istDatePlus } from './catalogue';

export const DEMO_DOCTOR_REG = 'DEMO-MMC-000001';
export const DEMO_PARTNER_LICENCE = 'DEMO-DL20-PARTNER-0001';

export async function seedDoctor(adminId: string, doctorMobile: string) {
  const { user_id: userId } = await enableDoctor(adminId, doctorMobile);
  const saved = await saveProfile(userId, {
    full_name: 'Dr Demo Doctor', qualification: 'MBBS (DEMO)', council: 'Maharashtra Medical Council (DEMO)',
    nmc_reg_number: DEMO_DOCTOR_REG, registration_year: 2012, speciality: 'General Physician', clinic_name: 'Demo Clinic, Nashik (DEMO)',
    consultation_fee_paise: 30000, bio: 'Demo doctor profile for the trial server. Not a real practitioner.', languages_spoken: ['English', 'Hindi', 'Marathi'],
  });
  if (!saved.is_verified) await decideDoctor(adminId, saved.id, true, 'Trial demo doctor (not a real registration)', DEMO_DOCTOR_REG);
  // Four 15-minute slots each morning and evening for the next three days (IST)
  const times = ['10:00', '10:15', '10:30', '10:45', '18:00', '18:15', '18:30', '18:45'];
  const plus15 = (t: string) => { const [h, m] = t.split(':').map(Number); const x = h * 60 + m + 15; return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; };
  const slots = [1, 2, 3].flatMap((d) => times.map((t) => ({ slot_date: istDatePlus(d), slot_start: t, slot_end: plus15(t) })));
  const r = await addSlots(userId, slots);
  return { doctorId: saved.id, slotsAdded: r.added };
}

export async function seedPartner(c: PoolClient, adminId: string, partnerUserId: string) {
  const v = (await c.query(
    `INSERT INTO vendors (name, drug_license_no, gst_number, gst_type, contact_name, contact_mobile, contact_email, pincode, city, state,
       address_line1, latitude, longitude, vendor_type, approval_status, kyc_status, drug_license_type, drug_license_expiry,
       drug_license_verified, approved_by, approved_at, is_active, invoice_prefix)
     VALUES ('Demo Partner Pharmacy (DEMO)', $1, NULL, 'unregistered', 'Demo Partner Owner', '9000090008', 'partner-demo@example.com',
       '422003', 'Nashik', 'Maharashtra', 'DEMO address — not a real shop, Panchavati, Nashik 422003', 20.0112, 73.7927,
       'marketplace_partner', 'approved', 'approved', 'dl20', CURRENT_DATE + 700, TRUE, $2, NOW(), TRUE, 'DMOP')
     ON CONFLICT (drug_license_no) DO UPDATE SET approval_status = 'approved', kyc_status = 'approved', is_active = TRUE,
       drug_license_expiry = CURRENT_DATE + 700, vendor_type = 'marketplace_partner', updated_at = NOW()
     RETURNING id, (xmax = 0) AS created`, [DEMO_PARTNER_LICENCE, adminId])).rows[0];
  await c.query(`INSERT INTO vendor_users (vendor_id, user_id, created_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [v.id, partnerUserId, adminId]);
  if (v.created) await writeAuditTx(c, { userId: partnerUserId, action: 'partner_approved', performedBy: adminId, notes: 'Trial demo partner',
    newValue: { vendor_id: v.id } });
  let listings = 0;
  for (const m of DEMO_MEDICINES.filter((x) => x.partner)) {
    const product = (await c.query(`SELECT id, name, generic_name, drug_schedule, hsn_code, gst_rate, mrp_paise FROM products WHERE sku = $1`,
      [DEMO_SKU_PREFIX + m.code])).rows[0];
    // Live listing at Dawabag's catalogue price (owner decision 30 Sep 2026; C-16)
    const pp = (await c.query(
      `INSERT INTO partner_products (partner_id, product_id, medicine_name, generic_name, partner_sku, drug_schedule, hsn_code, gst_rate,
         mrp_paise, approval_status, listing_status, catalogue_price_accepted, reviewed_by, reviewed_at, posted_by, posted_at, submitted_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'approved', 'live', TRUE, $10, NOW(), $10, NOW(), $11)
       ON CONFLICT (partner_id, product_id) WHERE product_id IS NOT NULL
       DO UPDATE SET approval_status = 'approved', listing_status = 'live', catalogue_price_accepted = TRUE, mrp_paise = EXCLUDED.mrp_paise,
         updated_at = NOW()
       RETURNING id`,
      [v.id, product.id, product.name, product.generic_name, `P-${m.code}`, product.drug_schedule, product.hsn_code, product.gst_rate,
       product.mrp_paise, adminId, partnerUserId])).rows[0];
    await c.query(
      `INSERT INTO partner_inventory (partner_product_id, partner_id, batch_number, qty_available, expiry_date, manufactured_date, purchase_price_paise)
       VALUES ($1, $2, $3, 120, CURRENT_DATE + 540, CURRENT_DATE - 20, $4)
       ON CONFLICT (partner_product_id, batch_number) DO UPDATE SET qty_available = GREATEST(partner_inventory.qty_available, partner_inventory.qty_reserved + 60),
         expiry_date = EXCLUDED.expiry_date, is_recalled = FALSE, last_updated_at = NOW()`,
      [pp.id, v.id, `DEMO-P-${m.code}`, Math.round(product.mrp_paise * 0.55)]);
    listings++;
  }
  return { vendorId: v.id as string, listings };
}
