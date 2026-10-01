// Sprint 10 test data: mobiles 90000010xx, SKU prefix S10-
import { call, check, login, q, signUp } from '../sprint5/lib.mjs';

const consent = { accept_privacy_notice: true, age_confirmed: true };
const person = (mobile, name) => ({ customer_type: 'customer', full_name: name, mobile, password: 'Passw0rd!', ...consent });
export const people = {
  admin: person('9000001001', 'S10 Admin'), doctor: person('9000001002', 'S10 Doctor'), doctor2: person('9000001003', 'S10 Unchecked Doctor'),
  patient: person('9000001004', 'S10 Patient'), patient2: person('9000001005', 'S10 Other Patient'), pharmacist: person('9000001006', 'S10 Pharmacist'),
};

export async function cleanup() {
  const ids = (await q(`SELECT id FROM users WHERE mobile = ANY($1)`, [Object.values(people).map((p) => p.mobile)])).map((r) => r.id);
  const productIds = (await q(`SELECT id FROM products WHERE sku LIKE 'S10-%'`)).map((r) => r.id);
  const doctorIds = (await q(`SELECT id FROM doctor_profiles WHERE user_id = ANY($1)`, [ids])).map((r) => r.id);
  const rxIds = (await q(`SELECT id FROM digital_prescriptions WHERE doctor_id = ANY($1)`, [doctorIds])).map((r) => r.id);
  const run = (sql, p) => q(sql, p);
  await run('DELETE FROM prescriptions WHERE digital_prescription_id = ANY($1) OR user_id = ANY($2)', [rxIds, ids]);
  await run('DELETE FROM digital_prescription_items WHERE prescription_id = ANY($1)', [rxIds]);
  await run('DELETE FROM digital_prescriptions WHERE id = ANY($1)', [rxIds]);
  await run('DELETE FROM consultations WHERE doctor_id = ANY($1) OR patient_user_id = ANY($2)', [doctorIds, ids]);
  await run('DELETE FROM doctor_slots WHERE doctor_id = ANY($1)', [doctorIds]);
  await run('DELETE FROM doctor_profiles WHERE id = ANY($1)', [doctorIds]);
  await run('DELETE FROM patients WHERE owner_user_id = ANY($1)', [ids]);
  await run('UPDATE audit_logs SET performed_by = NULL WHERE performed_by = ANY($1)', [ids]);
  await run('UPDATE products SET content_reviewed_by = NULL WHERE content_reviewed_by = ANY($1)', [ids]);
  for (const t of ['notification_deliveries', 'user_devices', 'notifications', 'consent_records', 'audit_logs', 'user_profiles']) {
    await run(`DELETE FROM ${t} WHERE user_id = ANY($1)`, [ids]);
  }
  await run('DELETE FROM users WHERE id = ANY($1)', [ids]);
  await run(`DELETE FROM audit_logs WHERE new_value->>'product_id' = ANY($1::text[]) OR old_value->>'product_id' = ANY($1::text[])`, [productIds]);
  await run('DELETE FROM products WHERE id = ANY($1)', [productIds]);
}

export async function setup() {
  const ids = {};
  for (const [k, p] of Object.entries(people)) ids[k] = (await signUp(p)).user_id;
  await q(`UPDATE users SET role = 'super_admin' WHERE id = $1`, [ids.admin]);
  await q(`UPDATE users SET role = 'pharmacist_rx', pharmacist_reg_no = 'MSPC-S10-1' WHERE id = $1`, [ids.pharmacist]);
  await q(`UPDATE user_profiles SET date_of_birth = '1990-05-01', gender = 'female' WHERE user_id = $1`, [ids.patient]);
  const t = {};
  for (const [k, p] of Object.entries(people)) t[k] = await login(p);
  const decl = { net_quantity: '10 tablets', manufacturer_name: 'S10 Pharma', manufacturer_address: 'Plot 10, MIDC Satpur, Nashik 422007' };
  const mk = async (sku, name, schedule, extra = {}) => {
    const r = await call('POST', '/products', { token: t.admin, body: { name, sku, category: 'Smoke', drug_schedule: schedule, gst_rate: 12,
      hsn_code: '30049099', mrp_paise: 10000, offer_price_paise: 9000, max_qty_per_order: 10, ...decl, ...extra } });
    check(`product ${sku} created`, r.status === 201, r.json);
    return r.json.data?.id;
  };
  const P = {
    otc: await mk('S10-OTC', 'S10 Paracetamol 500', 'OTC', { generic_name: 'Paracetamol' }),
    a: await mk('S10-A', 'S10 Amoxicillin 500', 'Schedule H', { generic_name: 'Amoxicillin' }),
    b: await mk('S10-B', 'S10 Telmisartan 40', 'Schedule H'),
    unclassified: await mk('S10-U', 'S10 Unclassified', 'Schedule H'),
    ndps: await mk('S10-N', 'S10 Codeine Syrup', 'NDPS'),
  };
  return { ids, t, P };
}

// Slot times in Indian time, minutes from now
export function istSlot(minutes, length = 15) {
  const at = new Date(Date.now() + 5.5 * 3600e3 + minutes * 60e3);
  const end = new Date(at.getTime() + length * 60e3);
  const hm = (d) => d.toISOString().slice(11, 16);
  return { slot_date: at.toISOString().slice(0, 10), slot_start: hm(at), slot_end: hm(end) };
}
export { login };
