// Sprint 46 smoke test data: mobiles 90000046xx, SKUs S46-, vendors 'S46 %', category
// 'S46 Demo Antibiotics', HSN 30046046. Every name, item and number below is a made-up
// DEMO item (no real business data). Removed by cleanup().
import { createRequire } from 'module';
import { API, login, q, signUp } from '../sprint5/lib.mjs';

const require = createRequire(import.meta.url);
export const ExcelJS = require('exceljs');

const person = (mobile, name) => ({ customer_type: 'customer', full_name: name, mobile, password: 'Passw0rd!',
  accept_privacy_notice: true, age_confirmed: true });
export const people = {
  admin: person('9000004601', 'S46 Admin'),
  pharmacistA: person('9000004602', 'S46 Pharmacist Asha'),
  pharmacistB: person('9000004603', 'S46 Pharmacist Bhaskar'),
  buyer: person('9000004604', 'S46 Buyer'),
};
export const ids = {};
export const t = {};
export const V = {};
export const P = {};
export const R = {};
export const CATEGORY = 'S46 Demo Antibiotics';
export const HSN = '30046046';

/** The partner's items as its billing export prints them (name | pack | company) — demo values. */
export const ITEMS = {
  draft1: ['S46 DEMOCILLIN 500 TAB', '10 TAB', 'S46DEMO'],
  draft2: ['S46 DEMOVITA 1 CAP', '30 CAP', 'S46DEMO'],
  draftX: ['S46 DEMOXANT 2 TAB', '10 TAB', 'S46DEMO'],
  live: ['S46 DEMOLIVE 40 TAB', '15 TAB', 'S46DEMO'],
  partnerB: ['S46 DEMOBEE 100 TAB', '10 TAB', 'S46DEMO'],
  requested: ['S46 DEMOREQ 5 TAB', '10 TAB', 'S46DEMO'],
  unknown: ['S46 UNKNOWNIX 1 TAB', '1', 'S46DEMO'],
};

async function productIds(vendorIds) {
  return (await q(
    `SELECT id FROM products WHERE sku LIKE 'S46-%'
     UNION SELECT product_id FROM partner_product_requests WHERE partner_id = ANY($1) AND product_id IS NOT NULL
     UNION SELECT product_id FROM catalogue_drafts WHERE from_file->>'partner_id' = ANY($1::text[])`, [vendorIds])).map((r) => r.id ?? r.product_id);
}

export async function cleanup() {
  const userIds = (await q('SELECT id FROM users WHERE mobile = ANY($1)', [Object.values(people).map((p) => p.mobile)])).map((r) => r.id);
  const vendorIds = (await q(`SELECT id FROM vendors WHERE name LIKE 'S46 %'`)).map((r) => r.id);
  const products = await productIds(vendorIds);
  await q(`DELETE FROM audit_logs WHERE new_value->>'vendor_id' = ANY($1::text[]) OR new_value->>'product_id' = ANY($2::text[])`,
    [vendorIds, products]);
  await q('DELETE FROM catalogue_draft_suggestions WHERE product_id = ANY($1) OR partner_id = ANY($2)', [products, vendorIds]);
  await q('DELETE FROM partner_product_requests WHERE partner_id = ANY($1) OR product_id = ANY($2)', [vendorIds, products]);
  await q('DELETE FROM partner_item_links WHERE partner_id = ANY($1) OR product_id = ANY($2)', [vendorIds, products]);
  await q('DELETE FROM partner_products WHERE partner_id = ANY($1) OR product_id = ANY($2)', [vendorIds, products]);
  await q('DELETE FROM vendor_users WHERE vendor_id = ANY($1) OR user_id = ANY($2)', [vendorIds, userIds]);
  await q('UPDATE audit_logs SET performed_by = NULL WHERE performed_by = ANY($1)', [userIds]);
  for (const tbl of ['notifications', 'addresses', 'consent_records', 'audit_logs', 'pharmacist_registrations', 'user_profiles']) {
    await q(`DELETE FROM ${tbl} WHERE user_id = ANY($1)`, [userIds]);
  }
  await q('UPDATE products SET content_reviewed_by = NULL, online_sale_set_by = NULL WHERE content_reviewed_by = ANY($1) OR online_sale_set_by = ANY($1)', [userIds]);
  await q('DELETE FROM product_online_status_log WHERE product_id = ANY($1)', [products]).catch(() => {});
  await q('DELETE FROM catalogue_drafts WHERE product_id = ANY($1)', [products]);
  await q('DELETE FROM products WHERE id = ANY($1)', [products]);
  await q(`DELETE FROM audit_logs WHERE action IN ('product_category_created', 'hsn_code_created')
             AND (new_value->>'name' LIKE 'S46 %' OR new_value->>'code' = $1)`, [HSN]);
  await q(`DELETE FROM product_categories WHERE name_key LIKE 's46 %'`);
  await q('DELETE FROM hsn_codes WHERE code = $1', [HSN]);
  await q('DELETE FROM users WHERE id = ANY($1)', [userIds]);
  await q('DELETE FROM vendors WHERE id = ANY($1)', [vendorIds]);
}

const vendor = async (name, dl, prefix) => (await q(
  `INSERT INTO vendors (name, drug_license_no, gst_number, pincode, city, state, latitude, longitude, vendor_type, approval_status, is_active,
                        invoice_prefix, drug_license_type, drug_license_expiry)
   VALUES ($1, $2, '27ABCDE4646F1Z5', '499946', 'Nashik', 'Maharashtra', 20.0, 73.8, 'marketplace_partner', 'approved', TRUE, $3, 'dl20b', CURRENT_DATE + 500)
   RETURNING id`, [name, dl, prefix]))[0].id;

/** A live demo product (fully decided). */
async function liveProduct(sku, name) {
  return (await q(
    `INSERT INTO products (name, generic_name, sku, category, drug_schedule, gst_rate, hsn_code, mrp_paise, offer_price_paise, catalogue_state, is_active,
                           manufacturer_name, manufacturer_address, country_of_origin, net_quantity, strength, dosage_form)
     VALUES ($1, 'S46 Demolive', $2, $3, 'OTC', 12, $4, 1000, 900, 'live', TRUE,
             'S46 Demo Labs Pvt Ltd', 'Plot 46, Demo Estate', 'India', '15 tablets', '40 mg', 'Tablet') RETURNING id`, [name, sku, CATEGORY, HSN]))[0].id;
}

/** A draft product exactly as Sprint 29 "Create drafts" leaves it: only the file's details, nothing clinical decided. */
async function draftProduct(sku, item, partnerId) {
  const id = (await q(
    `INSERT INTO products (name, sku, category, drug_schedule, gst_rate, marketed_by, net_quantity, mrp_paise, offer_price_paise,
                           is_active, catalogue_state, content_status, country_of_origin, cold_chain,
                           manufacturer_name, manufacturer_address)
     VALUES ($1, $2, NULL, NULL, NULL, $3, $4, 1500, 1500, FALSE, 'draft', 'pending_review', 'India', FALSE,
             'S46 Demo Labs Pvt Ltd', 'Plot 46, Demo Estate') RETURNING id`, [item[0], sku, item[2], item[1]]))[0].id;
  await q(`INSERT INTO catalogue_drafts (product_id, source, from_file) VALUES ($1, 'partner_request', $2)`,
    [id, JSON.stringify({ partner_id: partnerId, partner_name: 'S46', item_name: item[0], pack: item[1], company: item[2], gst_rate: null, mrp_paise: 1500 })]);
  await link(partnerId, item, id);
  return id;
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
  await q(`UPDATE users SET role = 'pharmacist_rx', pharmacist_reg_no = 'S46-MSPC-0001' WHERE id = $1`, [ids.pharmacistA]);
  await q(`UPDATE users SET role = 'pharmacist_rx', pharmacist_reg_no = 'S46-MSPC-0002' WHERE id = $1`, [ids.pharmacistB]);
  await q(`INSERT INTO product_categories (name) VALUES ($1) ON CONFLICT DO NOTHING`, [CATEGORY]);
  await q(`INSERT INTO hsn_codes (code, description, gst_rate) VALUES ($1, 'S46 demo medicaments', 12) ON CONFLICT DO NOTHING`, [HSN]);
  V.A = await vendor('S46 Demo Partner A', 'DL-S46-A', 'S46A');
  V.B = await vendor('S46 Demo Partner B', 'DL-S46-B', 'S46B');
  P.draft1 = await draftProduct('S46-D1', ITEMS.draft1, V.A);
  P.draft2 = await draftProduct('S46-D2', ITEMS.draft2, V.A);
  P.draftX = await draftProduct('S46-DX', ITEMS.draftX, V.A);
  P.partnerB = await draftProduct('S46-DB', ITEMS.partnerB, V.B);
  P.live = await liveProduct('S46-LIVE', 'S46 Demolive 40 mg Tablet');
  await link(V.A, ITEMS.live, P.live);
  // An open request of partner A that has no draft yet (Sprint 27)
  R.requested = (await q(
    `INSERT INTO partner_product_requests (partner_id, item_key, item_name, pack, manufacturer, gst_rate, mrp_paise, status)
     VALUES ($1, $2, $3, $4, $5, 12, 2000, 'open') RETURNING id`,
    [V.A, itemKey(ITEMS.requested), ...ITEMS.requested]))[0].id;
  for (const [k, p] of Object.entries(people)) t[k] = await login(p);
}

export const HEAD = ['item_name', 'pack', 'company', 'generic_name', 'strength', 'dosage_form', 'drug_schedule', 'cold_chain',
  'product_class', 'is_new_drug', 'category', 'hsn_code', 'gst_rate', 'confidence', 'note'];

/** A suggestion row for an item; `over` replaces columns by name. */
export const suggestion = (item, over = {}) => {
  const base = { generic_name: 'S46 Democillin', strength: '500 mg', dosage_form: 'Tablet', drug_schedule: 'Schedule H', cold_chain: 'no',
    product_class: 'drug', is_new_drug: 'no', category: CATEGORY.toLowerCase(), hsn_code: HSN, gst_rate: '12', confidence: 'high', note: 'Demo note' };
  const v = { item_name: item[0], pack: item[1], company: item[2], ...base, ...over };
  return HEAD.map((h) => v[h] ?? '');
};

/** rows (arrays in HEAD order) → .xlsx Buffer with the suggestions sheet. */
export async function workbook(rows, { sheet = 'suggestions', head = HEAD } = {}) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheet);
  ws.addRow(head);
  for (const r of rows) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** POST /catalogue-suggestions/imports as multipart. */
export async function upload(token, { buffer, partnerId, name = 'demo_suggestions.xlsx' }) {
  const form = new FormData();
  if (buffer) form.append('file', new Blob([buffer]), name);
  if (partnerId) form.append('partner_id', partnerId);
  const res = await fetch(`${API}/catalogue-suggestions/imports`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}
