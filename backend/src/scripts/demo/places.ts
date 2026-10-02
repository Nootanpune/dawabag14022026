// src/scripts/demo/places.ts — where the trial "delivers" and who it says it is:
// Nashik PIN codes with Dawabag's own delivery hours and ₹49 charge, the dispatch
// premises, and legal settings filled with clearly marked placeholders so the
// licence / pharmacist / grievance footer renders (C-03, C-04, C-36) without
// pretending to be a real licence.
import { PoolClient } from 'pg';
import { writeAuditTx } from '../../utils/audit';

export const DEMO_MARK = 'DEMO — not a real licence';

// Approximate centres of Nashik city PIN areas
export const DEMO_PINCODES = [
  { pincode: '422001', area: 'Nashik GPO', lat: 19.9975, lng: 73.7898 },
  { pincode: '422002', area: 'Nashik Road', lat: 19.9536, lng: 73.8392 },
  { pincode: '422003', area: 'Panchavati', lat: 20.0112, lng: 73.7927 },
  { pincode: '422005', area: 'Gangapur Road', lat: 20.0076, lng: 73.7590 },
  { pincode: '422006', area: 'Cidco', lat: 19.9690, lng: 73.7600 },
  { pincode: '422007', area: 'Satpur', lat: 20.0060, lng: 73.7400 },
  { pincode: '422009', area: 'Indira Nagar', lat: 19.9800, lng: 73.7750 },
  { pincode: '422011', area: 'Upnagar', lat: 19.9640, lng: 73.8130 },
];
export const DEMO_PREMISES = { pincode: '422001', latitude: 19.9975, longitude: 73.7898 };

// Defaults from database/07_sprint4_fulfilment_compliance.sql, put back by --remove
export const LEGAL_DEFAULTS: Record<string, unknown> = {
  'legal.entity': { name: 'Dawabag Private Limited', address: '', gstin: '', cin: '' },
  'legal.pharmacist_in_charge': { name: '', registration_no: '' },
  'legal.grievance_officer': { name: '', email: '', phone: '', address: '' },
};

// Same shapes the admin Settings screen validates (marketplaceAdmin.controller SETTING_SCHEMAS)
export function demoLegalSettings(): Record<string, unknown> {
  return {
    'legal.entity': { name: 'Dawabag Private Limited (DEMO trial)', address: 'DEMO address — not a real premises, Nashik 422001, Maharashtra',
      gstin: 'DEMO-NOT-REAL', cin: 'DEMO-NOT-A-REAL-CIN' },
    'legal.pharmacist_in_charge': { name: 'Demo Pharmacist (DEMO)', registration_no: 'DEMO-MSPC-0001' },
    'legal.grievance_officer': { name: 'Demo Grievance Officer (DEMO)', email: 'grievance-demo@example.com', phone: '0000000000',
      address: 'DEMO address — not real, Nashik 422001' },
  };
}

export async function seedPlaces(c: PoolClient, adminId: string) {
  for (const p of DEMO_PINCODES) {
    await c.query(
      `INSERT INTO pincode_serviceability (pincode, city, state, is_serviceable, shipping_charge_paise, estimated_days,
         latitude, longitude, dawabag_delivery_hours)
       VALUES ($1, 'Nashik', 'Maharashtra', TRUE, 4900, 1, $2, $3, 24)
       ON CONFLICT (pincode) DO UPDATE SET city = 'Nashik', state = 'Maharashtra', is_serviceable = TRUE, shipping_charge_paise = 4900,
         estimated_days = 1, latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude, dawabag_delivery_hours = 24, updated_at = NOW()`,
      [p.pincode, p.lat, p.lng]);
  }
  const settings: Record<string, unknown> = { 'dawabag.premises': DEMO_PREMISES, ...demoLegalSettings() };
  for (const [key, value] of Object.entries(settings)) {
    const before = (await c.query('SELECT value FROM app_settings WHERE key = $1', [key])).rows[0];
    if (!before) throw new Error(`Setting ${key} is missing: run the migrations first`);
    if (JSON.stringify(before.value) === JSON.stringify(value)) continue;
    await c.query('UPDATE app_settings SET value = $2, updated_by = $3, updated_at = NOW() WHERE key = $1', [key, JSON.stringify(value), adminId]);
    await writeAuditTx(c, { userId: null, action: 'setting_changed', performedBy: adminId, notes: 'Trial demo seed',
      oldValue: { key, value: before.value }, newValue: { key, value } });
  }
  // Dawabag's drug licences live in the licence register (C-07, Sprint 30), shown in the footer from there
  const validUpto = new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10);
  for (const [type, form] of DEMO_LICENCE_TYPES) {
    await c.query(
      `INSERT INTO business_licences (licence_type, licence_number, valid_upto, renewal_owner, notes, created_by)
       VALUES ($1, $2, $3, 'Demo owner (DEMO)', 'Trial demo seed — not a real licence', $4)
       ON CONFLICT (licence_type, licence_number) DO UPDATE SET valid_upto = EXCLUDED.valid_upto, is_active = TRUE, updated_at = NOW()`,
      [type, `${DEMO_MARK} (${form})`, validUpto, adminId]);
  }
  return { pincodes: DEMO_PINCODES.length };
}

/** Demo rows of Dawabag's licence register; --remove deletes rows numbered with DEMO_MARK. */
export const DEMO_LICENCE_TYPES: [string, string][] = [['retail_20', '20'], ['retail_21', '21'], ['wholesale_20b', '20B'], ['wholesale_21b', '21B']];
