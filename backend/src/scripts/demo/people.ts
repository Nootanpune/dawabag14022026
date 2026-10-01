// src/scripts/demo/people.ts — one demo login per role, all with the trial's single
// password (TRIAL_DEMO_PASSWORD), upserted by mobile number. Accounts are created
// the way registration leaves them (profile, consent records with the notice
// version, 18+ confirmation — C-40, C-42), already verified because the trial sends
// no SMS; roles are then given the way an admin gives them (C-11 KYC approved for
// the retailer, council registration for the pharmacist and doctor — C-13, C-22).
import bcrypt from 'bcryptjs';
import { PoolClient } from 'pg';
import { privacyNoticeRef } from '../../services/policy.service';
import { writeAuditTx } from '../../utils/audit';

export type DemoRole = 'customer' | 'retailer' | 'pharmacist_rx' | 'pharmacist_pack' | 'delivery' | 'admin' | 'doctor' | 'partner';

export interface DemoPerson { key: DemoRole; mobile: string; name: string; role: string; what: string }

// 90000900xx: a block no test suite or real customer uses
export const DEMO_PEOPLE: DemoPerson[] = [
  { key: 'customer', mobile: '9000090001', name: 'Demo Customer', role: 'customer', what: 'Shop, upload a prescription, check out' },
  { key: 'retailer', mobile: '9000090002', name: 'Demo Retailer', role: 'customer (B2B retailer, KYC approved)', what: 'Trade prices (PTR), credit bills' },
  { key: 'pharmacist_rx', mobile: '9000090003', name: 'Demo Pharmacist', role: 'pharmacist_rx', what: 'Verify prescriptions, approve product copy' },
  { key: 'pharmacist_pack', mobile: '9000090004', name: 'Demo Packer', role: 'pharmacist_pack', what: 'Pack and dispatch orders' },
  { key: 'delivery', mobile: '9000090005', name: 'Demo Rider', role: 'delivery', what: 'Own run sheet, delivery codes' },
  { key: 'admin', mobile: '9000090006', name: 'Demo Admin', role: 'super_admin', what: 'Everything: settings, catalogue, users, reports' },
  { key: 'doctor', mobile: '9000090007', name: 'Dr Demo Doctor', role: 'doctor (verified)', what: 'Slots, consultations, e-prescriptions' },
  { key: 'partner', mobile: '9000090008', name: 'Demo Partner Owner', role: 'partner', what: 'Partner pharmacy portal: listings, stock, orders' },
];
export const DEMO_MOBILES = DEMO_PEOPLE.map((p) => p.mobile);

const DB_ROLE: Record<DemoRole, string> = {
  customer: 'customer', retailer: 'customer', pharmacist_rx: 'pharmacist_rx', pharmacist_pack: 'pharmacist_pack',
  delivery: 'delivery', admin: 'super_admin', doctor: 'customer', partner: 'partner',   // doctor: enabled by the doctor service
};

export async function upsertPeople(c: PoolClient, password: string): Promise<Record<DemoRole, string>> {
  const hash = await bcrypt.hash(password, parseInt(process.env.BCRYPT_ROUNDS || '12'));
  const notice = await privacyNoticeRef('en');
  const ids = {} as Record<DemoRole, string>;
  for (const p of DEMO_PEOPLE) {
    const existing = (await c.query('SELECT id, role FROM users WHERE mobile = $1 AND deleted_at IS NULL', [p.mobile])).rows[0];
    // A doctor keeps the role the doctor service gave it on an earlier run
    const role = p.key === 'doctor' && existing?.role === 'doctor' ? 'doctor' : DB_ROLE[p.key];
    const retailer = p.key === 'retailer';
    const r = (await c.query(
      `INSERT INTO users (mobile, password_hash, role, customer_type, kyc_status, mobile_verified, is_active, age_confirmed_at,
         registration_pincode, preferred_language)
       VALUES ($1, $2, $3, $4, $5, TRUE, TRUE, NOW(), '422001', 'en')
       ON CONFLICT (mobile) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role,
         customer_type = EXCLUDED.customer_type, kyc_status = EXCLUDED.kyc_status, mobile_verified = TRUE, is_active = TRUE,
         failed_login_attempts = 0, locked_until = NULL, deleted_at = NULL, updated_at = NOW()
       RETURNING id`,
      [p.mobile, hash, role, retailer ? 'b2b_retailer' : 'customer', retailer ? 'approved' : 'not_required'])).rows[0];
    ids[p.key] = r.id;
    if (!(await c.query('SELECT 1 FROM user_profiles WHERE user_id = $1', [r.id])).rows[0]) {
      await c.query(`INSERT INTO user_profiles (user_id, full_name, referral_code) VALUES ($1, $2, $3)`,
        [r.id, p.name, `DEMO${p.mobile.slice(-4)}`]);
    } else {
      await c.query('UPDATE user_profiles SET full_name = $2, updated_at = NOW() WHERE user_id = $1', [r.id, p.name]);
    }
    if (!(await c.query(`SELECT 1 FROM consent_records WHERE user_id = $1 AND purpose = 'privacy_notice'`, [r.id])).rows[0]) {
      for (const [purpose, granted] of [['privacy_notice', true], ['age_18_plus', true], ['marketing', false]] as const) {
        await c.query(
          `INSERT INTO consent_records (user_id, purpose, granted, policy_version, notice_language, ip_address, user_agent)
           VALUES ($1, $2, $3, $4, $5, NULL, 'trial demo seed')`, [r.id, purpose, granted, notice.version, notice.language]);
      }
    }
    if (!existing) await writeAuditTx(c, { userId: r.id, action: 'demo_account_created', performedBy: null, notes: `Trial demo login: ${p.role}` });
  }
  // Trade buyer: licence and GST declaration as KYC approval leaves them (C-11)
  await c.query(
    `UPDATE users SET business_name = 'Demo Medical Stores (DEMO)', drug_license_type = 'dl20', drug_license_number = 'DEMO-DL20-0001',
       drug_license_expiry = CURRENT_DATE + 700, drug_license_verified = TRUE, drug_license_holder_name = 'Demo Retailer',
       gst_unregistered_declaration = TRUE, pan_number = NULL, kyc_approved_at = COALESCE(kyc_approved_at, NOW()),
       credit_limit_paise = GREATEST(credit_limit_paise, 5000000)
     WHERE id = $1`, [ids.retailer]);
  // Registered pharmacist for prescription checks and the H1 register (C-13, C-09)
  await c.query(`UPDATE users SET pharmacist_reg_no = 'DEMO-MSPC-0001' WHERE id = $1`, [ids.pharmacist_rx]);
  return ids;
}

export async function seedCustomerAddress(c: PoolClient, customerId: string) {
  const has = (await c.query(`SELECT 1 FROM addresses WHERE user_id = $1 AND deleted_at IS NULL`, [customerId])).rows[0];
  if (has) return;
  await c.query(
    `INSERT INTO addresses (user_id, label, full_name, mobile, address_line1, address_line2, city, state, pincode, is_default)
     VALUES ($1, 'Home', 'Demo Customer', '9000090001', 'Flat 1, Demo Residency (DEMO address)', 'College Road', 'Nashik', 'Maharashtra', '422005', TRUE)`,
    [customerId]);
}
