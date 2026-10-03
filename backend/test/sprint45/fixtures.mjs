// Sprint 45 smoke test data: mobiles 90000045xx, SKUs S45-, vendors 'S45 %', PIN 499945.
// Every name, item and number below is a made-up DEMO item (no real business data).
// Removed by cleanup().
import { createRequire } from 'module';
import { API, login, q, signUp } from '../sprint5/lib.mjs';

const require = createRequire(import.meta.url);
export const ExcelJS = require('exceljs');

const person = (mobile, name) => ({ customer_type: 'customer', full_name: name, mobile, password: 'Passw0rd!',
  accept_privacy_notice: true, age_confirmed: true });
export const people = {
  admin: person('9000004501', 'S45 Admin'),
  pharmacistA: person('9000004502', 'S45 Pharmacist Asha'),
  pharmacistB: person('9000004503', 'S45 Pharmacist Bhaskar'),
  pharmacistC: person('9000004504', 'S45 Pharmacist Chitra'),
};
export const ids = {};
export const t = {};
export const V = {};
export const P = {};

/** The partner's items as its billing export prints them (name | pack | company) — demo values. */
export const ITEMS = {
  live: ['S45 DEMOCILLIN 500 TAB', '10 TAB', 'S45DEMO'],
  draft: ['S45 DEMONEW 5 TAB', '10 TAB', 'S45DEMO'],
  approved: ['S45 DEMOAPP 250 TAB', '10 TAB', 'S45DEMO'],
  pending: ['S45 DEMOPEND 40 TAB', '15 TAB', 'S45DEMO'],
  partnerB: ['S45 DEMOBEE 100 TAB', '10 TAB', 'S45DEMO'],
  later: ['S45 DEMOLATER 50 TAB', '10 TAB', 'S45DEMO'],
};

export async function cleanup() {
  const userIds = (await q('SELECT id FROM users WHERE mobile = ANY($1)', [Object.values(people).map((p) => p.mobile)])).map((r) => r.id);
  const productIds = (await q(`SELECT id FROM products WHERE sku LIKE 'S45-%'`)).map((r) => r.id);
  const vendorIds = (await q(`SELECT id FROM vendors WHERE name LIKE 'S45 %'`)).map((r) => r.id);
  await q(`DELETE FROM audit_logs WHERE new_value->>'vendor_id' = ANY($1::text[]) OR new_value->>'product_id' = ANY($2::text[])`,
    [vendorIds, productIds]);
  await q('DELETE FROM product_info_versions WHERE product_id = ANY($1)', [productIds]);
  await q('DELETE FROM partner_product_requests WHERE partner_id = ANY($1)', [vendorIds]);
  await q('DELETE FROM partner_item_links WHERE partner_id = ANY($1)', [vendorIds]);
  await q('DELETE FROM partner_products WHERE partner_id = ANY($1)', [vendorIds]);
  await q('DELETE FROM vendor_users WHERE vendor_id = ANY($1) OR user_id = ANY($2)', [vendorIds, userIds]);
  await q('UPDATE audit_logs SET performed_by = NULL WHERE performed_by = ANY($1)', [userIds]);
  for (const tbl of ['notifications', 'addresses', 'consent_records', 'audit_logs', 'pharmacist_registrations', 'user_profiles']) {
    await q(`DELETE FROM ${tbl} WHERE user_id = ANY($1)`, [userIds]);
  }
  await q('DELETE FROM catalogue_drafts WHERE product_id = ANY($1)', [productIds]);
  await q('DELETE FROM product_online_status_log WHERE product_id = ANY($1)', [productIds]).catch(() => {});
  await q('DELETE FROM products WHERE id = ANY($1)', [productIds]);
  await q('DELETE FROM users WHERE id = ANY($1)', [userIds]);
  await q('DELETE FROM vendors WHERE id = ANY($1)', [vendorIds]);
}

const vendor = async (name, dl, prefix) => (await q(
  `INSERT INTO vendors (name, drug_license_no, gst_number, pincode, city, state, latitude, longitude, vendor_type, approval_status, is_active,
                        invoice_prefix, drug_license_type, drug_license_expiry)
   VALUES ($1, $2, '27ABCDE4545F1Z5', '499945', 'Nashik', 'Maharashtra', 20.0, 73.8, 'marketplace_partner', 'approved', TRUE, $3, 'dl20b', CURRENT_DATE + 500)
   RETURNING id`, [name, dl, prefix]))[0].id;

/** A demo product; state 'draft' = a Sprint 29 draft (not active). */
async function product(sku, name, state = 'live') {
  return (await q(
    `INSERT INTO products (name, generic_name, sku, category, drug_schedule, gst_rate, hsn_code, mrp_paise, offer_price_paise, catalogue_state, is_active,
                           manufacturer_name, manufacturer_address, country_of_origin, net_quantity)
     VALUES ($1, $1, $2, 'S45 Smoke', CASE WHEN $3::text = 'draft' THEN NULL ELSE 'OTC' END, 12, '30049099', 1000, 900, $3::text, $3::text = 'live',
             'S45 Demo Labs Pvt Ltd', 'Plot 45, Demo Estate', 'India', '10 tablets') RETURNING id`, [name, sku, state]))[0].id;
}

/** item_key exactly as the partner stock import builds it (partnerStockImport/normalise.ts itemKey, no item code). */
export function itemKey([name, pack, company]) {
  const clean = (v) => String(v ?? '').toLowerCase().normalize('NFKC').replace(/[^a-z0-9%.]+/g, ' ').trim().replace(/\s+/g, ' ');
  return `name:${clean(name)}|${clean(pack)}|${clean(company)}`.slice(0, 400);
}

export const link = (partnerId, item, productId) => q(
  `INSERT INTO partner_item_links (partner_id, item_key, product_id, item_label, source) VALUES ($1, $2, $3, $4, 'admin')
   ON CONFLICT (partner_id, item_key) DO UPDATE SET product_id = EXCLUDED.product_id`, [partnerId, itemKey(item), productId, item[0]]);

export async function setup() {
  for (const [k, p] of Object.entries(people)) ids[k] = (await signUp(p)).user_id;
  await q(`UPDATE users SET role = 'admin' WHERE id = $1`, [ids.admin]);
  await q(`UPDATE users SET role = 'pharmacist_rx', pharmacist_reg_no = 'S45-MSPC-0001' WHERE id = $1`, [ids.pharmacistA]);
  await q(`UPDATE users SET role = 'pharmacist_rx', pharmacist_reg_no = 'S45-MSPC-0002' WHERE id = $1`, [ids.pharmacistB]);
  await q(`UPDATE users SET role = 'pharmacist_rx', pharmacist_reg_no = 'S45-MSPC-0003' WHERE id = $1`, [ids.pharmacistC]);
  V.A = await vendor('S45 Demo Partner A', 'DL-S45-A', 'S45A');
  V.B = await vendor('S45 Demo Partner B', 'DL-S45-B', 'S45B');
  P.live = await product('S45-LIVE', 'S45 Democillin 500 mg Tablet');
  P.draft = await product('S45-DRAFT', 'S45 Demonew 5 mg Tablet', 'draft');
  P.approved = await product('S45-APPR', 'S45 Demoapp 250 mg Tablet');
  P.pending = await product('S45-PEND', 'S45 Demopend 40 mg Tablet');
  P.partnerB = await product('S45-BEE', 'S45 Demobee 100 mg Tablet');
  P.later = await product('S45-LATER', 'S45 Demolater 50 mg Tablet');
  await link(V.A, ITEMS.live, P.live);
  await link(V.A, ITEMS.draft, P.draft);
  await link(V.A, ITEMS.approved, P.approved);
  await link(V.A, ITEMS.pending, P.pending);
  await link(V.B, ITEMS.partnerB, P.partnerB);
  // Existing information: approved (written by the admin, approved by B) and one waiting for review (written by A)
  await q(`INSERT INTO product_info_versions (product_id, version, status, content, author_ids, created_by, submitted_by, submitted_at,
             reviewed_by, reviewed_at, reviewer_name, reviewer_reg_no)
           VALUES ($1, 1, 'approved', '{"overview":"S45 approved words."}', ARRAY[$2::uuid], $2, $2, NOW(), $3, NOW(), 'S45 Pharmacist Bhaskar', 'S45-MSPC-0002')`,
    [P.approved, ids.admin, ids.pharmacistB]);
  await q(`INSERT INTO product_info_versions (product_id, version, status, content, author_ids, created_by, submitted_by, submitted_at)
           VALUES ($1, 1, 'pending_review', '{"overview":"S45 pending words."}', ARRAY[$2::uuid], $2, $2, NOW())`, [P.pending, ids.pharmacistA]);
  for (const [k, p] of Object.entries(people)) t[k] = await login(p);
}

export const HEAD = ['item_name', 'pack', 'company', 'assumed_composition', 'composition_confidence', 'drafting_note', 'content_json'];

export const content = (overview, extra = {}) => ({
  overview, uses: ['Demo use'], side_effects: { common: ['Demo nausea'] },
  references: [{ source: 'Demo pack insert', date: 'March 2026' }], ...extra,
});

/** rows: [[item, assumed, confidence, note, contentObjectOrRawString]] → .xlsx Buffer with the drafts sheet. */
export async function workbook(rows, { sheet = 'drafts', head = HEAD } = {}) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheet);
  ws.addRow(head);
  for (const [item, assumed, conf, note, c] of rows) {
    ws.addRow([...item, assumed, conf, note, typeof c === 'string' ? c : JSON.stringify(c)]);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** POST /medicines/info-imports as multipart. */
export async function upload(token, { buffer, partnerId, replace = false, name = 'demo_drafts.xlsx' }) {
  const form = new FormData();
  if (buffer) form.append('file', new Blob([buffer]), name);
  if (partnerId) form.append('partner_id', partnerId);
  if (replace) form.append('replace_drafts', 'true');
  const res = await fetch(`${API}/medicines/info-imports`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}
