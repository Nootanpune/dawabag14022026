// Sprint 29 — draft products from partner requests: partners upload stock files with
// items Dawabag does not list → requests → admin "Create drafts" (one draft per item,
// the same item from two partners grouped) → drafts invisible to buyers → pharmacist
// completes and approves 2, rejects 1, marks 1 Schedule X (never sellable) → partner
// re-check matches the approved ones → apply puts stock on sale for the approved only.
// Test data: mobiles 90000029xx, vendors 'S29 %', company code 'S29Q', SKUs S29-; removed by cleanup().
// Every item name is made up (no real business data).
import { API, call, check, login, q, signUp } from '../sprint5/lib.mjs';
import { buildMediVisionWorkbook } from '../fixtures/partnerStockFile.mjs';
import { licencePartner } from '../support/partnerLicences.mjs';

const PIN = '499929';
const COM = 'S29Q';
const person = (mobile, name) => ({ customer_type: 'customer', full_name: name, mobile, password: 'Passw0rd!', accept_privacy_notice: true, age_confirmed: true });
const people = {
  admin: person('9000002901', 'S29 Admin'), pharmacist: person('9000002902', 'S29 Pharmacist'),
  partnerA: person('9000002903', 'S29 Partner A'), partnerB: person('9000002904', 'S29 Partner B'), buyer: person('9000002905', 'S29 Buyer'),
};
const monthStart = (n) => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };

const FILE_A = [
  { name: 'QUORTANIL 5MG TAB', unit: '10 TAB', com: COM, tax: 5, batches: [
    { batch: 'Q1', exp: monthStart(20), purc: 25, ptr: 30, mrp: 42, sale: 40, qty: 30 },
    { batch: 'Q2', exp: monthStart(24), purc: 25, ptr: 30, mrp: 42, sale: 40, qty: 6 },
  ] },
  { name: 'VELMIRA 250MG CAP', unit: '10 CAP', com: COM, tax: 12, batches: [
    { batch: 'V1', exp: monthStart(18), purc: 50, ptr: 60, mrp: 90, sale: 85, qty: 12 },
  ] },
  { name: 'GLOSSOR CREAM 20GM', unit: '20 GM', com: COM, tax: 18, batches: [
    { batch: 'G1', exp: monthStart(18), purc: 60, ptr: 70, mrp: 120, sale: 110, qty: 5 },
  ] },
  { name: 'XANTRODEX 10MG TAB', unit: '10 TAB', com: COM, tax: 12, batches: [
    { batch: 'X1', exp: monthStart(12), purc: 30, ptr: 35, mrp: 50, sale: 45, qty: 4 },
  ] },
];
const FILE_B = [
  { name: 'Quortanil 5 mg Tab', unit: "10's", com: COM, tax: 5, batches: [
    { batch: 'QB1', exp: monthStart(20), purc: 25, ptr: 30, mrp: 42, sale: 41, qty: 9 },
  ] },
];

async function productIds(vendorIds) {
  const viaRequests = (await q('SELECT product_id FROM partner_product_requests WHERE partner_id = ANY($1) AND product_id IS NOT NULL', [vendorIds])).map((r) => r.product_id);
  const viaDrafts = (await q(`SELECT product_id FROM catalogue_drafts WHERE from_file->>'company' = $1`, [COM])).map((r) => r.product_id);
  const bySku = (await q(`SELECT id FROM products WHERE sku LIKE 'S29-%' OR marketed_by = $1`, [COM])).map((r) => r.id);
  return [...new Set([...viaRequests, ...viaDrafts, ...bySku])];
}

export async function cleanup() {
  const ids = (await q('SELECT id FROM users WHERE mobile = ANY($1)', [Object.values(people).map((p) => p.mobile)])).map((r) => r.id);
  const vendorIds = (await q(`SELECT id FROM vendors WHERE name LIKE 'S29 %'`)).map((r) => r.id);
  const products = await productIds(vendorIds);
  await q(`DELETE FROM audit_logs WHERE new_value->>'vendor_id' = ANY($1::text[]) OR new_value->>'product_id' = ANY($2::text[])`, [vendorIds, products]);
  await q('DELETE FROM partner_product_requests WHERE partner_id = ANY($1) OR product_id = ANY($2)', [vendorIds, products]);
  await q('DELETE FROM partner_item_links WHERE partner_id = ANY($1) OR product_id = ANY($2)', [vendorIds, products]);
  await q('DELETE FROM partner_stock_imports WHERE partner_id = ANY($1)', [vendorIds]);
  await q('DELETE FROM partner_import_mappings WHERE partner_id = ANY($1)', [vendorIds]);
  await q('DELETE FROM partner_inventory WHERE partner_id = ANY($1)', [vendorIds]);
  await q('DELETE FROM partner_products WHERE partner_id = ANY($1) OR product_id = ANY($2)', [vendorIds, products]);
  await q('DELETE FROM vendor_users WHERE vendor_id = ANY($1) OR user_id = ANY($2)', [vendorIds, ids]);
  await q('UPDATE audit_logs SET performed_by = NULL WHERE performed_by = ANY($1)', [ids]);
  for (const t of ['cart_items', 'carts', 'notifications', 'addresses', 'consent_records', 'audit_logs', 'user_profiles']) {
    await q(`DELETE FROM ${t} WHERE user_id = ANY($1)`, [ids]);
  }
  await q('UPDATE products SET content_reviewed_by = NULL WHERE content_reviewed_by = ANY($1)', [ids]);
  await q('DELETE FROM cart_items WHERE product_id = ANY($1)', [products]);
  await q('DELETE FROM catalogue_drafts WHERE product_id = ANY($1)', [products]);
  await q('DELETE FROM products WHERE id = ANY($1)', [products]);
  await q(`DELETE FROM audit_logs WHERE action = 'product_category_created' AND new_value->>'name' = 'S29 Smoke'`);
  await q(`DELETE FROM product_categories WHERE name_key = 's29 smoke'`);
  await q('DELETE FROM users WHERE id = ANY($1)', [ids]);
  await q('DELETE FROM vendors WHERE id = ANY($1)', [vendorIds]);
  await q('DELETE FROM pincode_serviceability WHERE pincode = $1', [PIN]);
}

export async function setup() {
  await q(`INSERT INTO pincode_serviceability (pincode, city, state, latitude, longitude, dawabag_delivery_hours, estimated_days)
           VALUES ($1, 'Pune', 'Maharashtra', 18.52, 73.85, 12, 1)`, [PIN]);
  const ids = {};
  for (const [k, p] of Object.entries(people)) ids[k] = (await signUp(p)).user_id;
  await q(`UPDATE users SET role = 'super_admin' WHERE id = $1`, [ids.admin]);
  await q(`UPDATE users SET role = 'pharmacist_rx' WHERE id = $1`, [ids.pharmacist]);
  await q(`UPDATE users SET role = 'partner' WHERE id = ANY($1)`, [[ids.partnerA, ids.partnerB]]);
  const vendor = async (name, dl, prefix) => (await q(
    `INSERT INTO vendors (name, drug_license_no, gst_number, pincode, city, state, latitude, longitude, vendor_type, approval_status, is_active,
                          invoice_prefix, drug_license_type, drug_license_expiry)
     VALUES ($1, $2, '27ABCDE2929F1Z5', $3, 'Pune', 'Maharashtra', 18.52, 73.85, 'marketplace_partner', 'approved', TRUE, $4, 'dl20b', CURRENT_DATE + 500)
     RETURNING id`, [name, dl, PIN, prefix]))[0].id;
  const V = { A: await vendor('S29 Partner A', 'DL-S29-A', 'S29A'), B: await vendor('S29 Partner B', 'DL-S29-B', 'S29B') };
  for (const v of Object.values(V)) await licencePartner(q, v);   // Sprint 32: retail + wholesale licences
  await q('INSERT INTO vendor_users (vendor_id, user_id) VALUES ($1, $2), ($3, $4)', [V.A, ids.partnerA, V.B, ids.partnerB]);
  const t = {};
  for (const [k, p] of Object.entries(people)) t[k] = await login(p);
  return { ids, t, V };
}

async function upload(token, buffer, name) {
  const form = new FormData();
  form.append('file', new Blob([buffer]), name);
  const res = await fetch(`${API}/partner/stock-imports`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}
const invalid = (r) => r.status === 400 || r.status === 422;   // refused by validation
const rowsOf = async (token, id, status) => (await call('GET', `/partner/stock-imports/${id}/rows?status=${status}&limit=100`, { token })).json.data?.rows ?? [];
const searchNames = async (text) => ((await call('GET', `/products/search?q=${encodeURIComponent(text)}&limit=20`)).json.data?.products ?? []).map((p) => p.name);
const stockOf = async (text, name) => Number(((await call('GET', `/products/search?q=${encodeURIComponent(text)}&limit=20`)).json.data?.products ?? [])
  .find((p) => p.name === name)?.stock_qty ?? -1);

async function uploadAndRequest(token, file, label) {
  const r = await upload(token, await buildMediVisionWorkbook(file, { company: `S29 ${label} (TEST)` }), `${label}.xlsx`);
  const imp = r.json.data;
  await call('PUT', `/partner/stock-imports/${imp.id}/mapping`, { token, body: { mapping: imp.mapping } });
  const req = await call('POST', `/partner/stock-imports/${imp.id}/request-new-products`, { token, body: {} });
  return { imp, req };
}

export async function run({ t, V, ids }) {
  console.log('\nPartners ask for items Dawabag does not list');
  const a = await uploadAndRequest(t.partnerA, FILE_A, 'partner A');
  check('partner A: 4 unknown items requested', a.req.status === 200 && a.req.json.data?.new_requests === 4, a.req.json);
  const b = await uploadAndRequest(t.partnerB, FILE_B, 'partner B');
  check('partner B: the same Quortanil (other spelling) requested', b.req.status === 200 && b.req.json.data?.new_requests === 1, b.req.json);
  let r = await call('GET', '/admin/partner-product-requests?status=open', { token: t.admin });
  const open = (r.json.data?.requests ?? []).filter((x) => [V.A, V.B].includes(x.partner_id));
  check('5 open requests for the admin', open.length === 5, open.map((x) => x.item_name));

  console.log('\nAdmin: Create drafts');
  r = await call('POST', '/admin/partner-product-requests/drafts', { token: t.pharmacist, body: { all_open: true } });
  check('only an admin creates drafts', r.status === 403, r.json);
  r = await call('POST', '/admin/partner-product-requests/drafts', { token: t.admin, body: { request_ids: open.map((x) => x.id), drug_schedule: 'OTC' } });
  check('nothing clinical can be sent with the batch', invalid(r), r.json);
  r = await call('POST', '/admin/partner-product-requests/drafts', { token: t.admin, body: { request_ids: open.map((x) => x.id) } });
  const made = r.json.data;
  check('4 drafts for 5 requests (Quortanil from both partners grouped)', r.status === 201 && made?.drafts_created === 4
    && made.requests_drafted === 5 && made.grouped === 1 && made.skipped.length === 0, made);
  r = await call('POST', '/admin/partner-product-requests/drafts', { token: t.admin, body: { request_ids: open.map((x) => x.id) } });
  check('the same requests cannot be drafted twice', r.status === 400, r.json);
  r = await call('GET', '/admin/partner-product-requests?status=drafted', { token: t.admin });
  check('requests now shown as drafted, each linked to its draft',
    (r.json.data?.requests ?? []).filter((x) => [V.A, V.B].includes(x.partner_id) && x.product_id && x.product_state === 'draft').length === 5, r.json.data?.requests);
  const drafts = Object.fromEntries((await q(
    `SELECT p.*, d.from_file FROM catalogue_drafts d JOIN products p ON p.id = d.product_id WHERE d.from_file->>'company' = $1`, [COM]))
    .map((p) => [p.name.split(' ')[0].toLowerCase(), p]));
  const D = { quortanil: drafts.quortanil, velmira: drafts.velmira, glossor: drafts.glossor, xantrodex: drafts.xantrodex };
  check('drafts pre-filled from the file only: name, pack, company, GST, MRP',
    D.quortanil?.net_quantity === '10 TAB' && D.quortanil.marketed_by === COM && D.quortanil.gst_rate === 5 && D.quortanil.mrp_paise === 4200
    && D.glossor?.gst_rate === 18 && D.velmira?.mrp_paise === 9000, D.quortanil);
  check('nothing clinical guessed: no schedule, category, generic name, HSN; cold chain undecided',
    Object.values(D).every((p) => p.drug_schedule === null && p.category === null && p.generic_name === null && p.hsn_code === null), Object.values(D).map((p) => p.drug_schedule));
  check('drafts are not active and not live', Object.values(D).every((p) => p.is_active === false && p.catalogue_state === 'draft'));
  check('the grouped draft lists both partners', D.quortanil?.from_file?.requests?.length === 2, D.quortanil?.from_file);
  const links = await q('SELECT partner_id, product_id FROM partner_item_links WHERE product_id = $1', [D.quortanil.id]);
  check('both partners\' items linked to the Quortanil draft', links.length === 2, links);

  console.log('\nDrafts are invisible to buyers');
  check('not in search', !(await searchNames('Quortanil')).length && !(await searchNames('Velmira')).length);
  r = await call('GET', `/products/search/suggest?q=Quortanl`);
  check('not in "did you mean"', r.status === 200 && !(r.json.data?.suggestions ?? []).some((s) => /quortanil/i.test(JSON.stringify(s))), r.json);
  r = await call('GET', `/products/${D.quortanil.id}`);
  check('product page not found', r.status === 404, r.json);
  r = await call('PUT', `/cart/items/${D.quortanil.id}`, { token: t.buyer, body: { quantity: 1 } });
  check('cannot be added to the cart', r.status === 404, r.json);
  r = await call('GET', '/products/categories');
  check('drafts add no category', r.status === 200, r.json);
  r = await call('GET', '/products/content-review/queue', { token: t.pharmacist });
  check('not in the old copy queue', r.status === 200 && !r.json.data.products.some((p) => p.id === D.quortanil.id), r.json);
  r = await call('POST', `/products/${D.quortanil.id}/content-review`, { token: t.pharmacist, body: { approve: true, notes: 'Looks fine' } });
  check('the copy review refuses a draft (409)', r.status === 409, r.json);
  r = await call('PATCH', `/products/${D.quortanil.id}`, { token: t.admin, body: { is_active: true } });
  check('admin cannot switch a draft on (409)', r.status === 409 && /pharmacist/.test(r.json.message), r.json);
  let dbRefused = false;
  try { await q('UPDATE products SET is_active = TRUE WHERE id = $1', [D.quortanil.id]); } catch (e) { dbRefused = /products_active_only_live/.test(e.message); }
  check('the database refuses an active draft', dbRefused);
  r = await call('POST', `/partner/stock-imports/${a.imp.id}/recheck`, { token: t.partnerA });
  const waiting = await rowsOf(t.partnerA, a.imp.id, 'needs_review');
  check('partner re-check: still waiting, told a pharmacist is completing it',
    r.status === 200 && waiting.length === 5 && waiting.every((x) => /pharmacist is completing/.test(x.warnings[0])), waiting.map((x) => x.warnings[0]));

  console.log('\nNew products to complete (pharmacist)');
  r = await call('GET', '/catalogue-drafts', { token: t.buyer });
  check('buyers cannot open the queue', r.status === 403, r.json);
  r = await call('GET', `/catalogue-drafts?company=${COM}`, { token: t.pharmacist });
  const queue = r.json.data;
  check('queue: 4 open drafts for the company, from-file details and what is missing',
    r.status === 200 && queue.drafts.length === 4 && queue.drafts.every((d) => d.problems[0] === 'Choose the drug schedule')
    && queue.companies.some((c) => c.company === COM && c.n === 4), queue?.drafts?.map((d) => d.problems));
  check('progress counter', queue.progress.total >= 4 && queue.progress.done <= queue.progress.total, queue.progress);
  const done0 = queue.progress.done;
  r = await call('GET', `/catalogue-drafts?company=${COM}&needs_schedule=true&cold_chain=undecided`, { token: t.admin });
  check('filters: needs schedule, cold chain undecided (admin can view)', r.status === 200 && r.json.data.total === 4, r.json.data?.total);
  r = await call('GET', '/catalogue-drafts/options', { token: t.pharmacist });
  check('options: schedules incl. X / NDPS, forms, GST slabs', r.json.data?.schedules?.includes('NDPS') && r.json.data.dosage_forms.includes('Tablet')
    && r.json.data.gst_rates.includes(5), r.json.data);

  r = await call('POST', '/catalogue-drafts/bulk', { token: t.pharmacist, body: { product_ids: [D.quortanil.id], set: { drug_schedule: 'OTC' } } });
  check('bulk-set refuses the schedule', invalid(r) && /drug_schedule/.test(r.json.message), r.json);
  // Category and HSN come from their managed lists (Sprint 31): add them first
  await call('POST', '/catalogue-lists/categories', { token: t.pharmacist, body: { name: 'S29 Smoke' } });
  await call('POST', '/catalogue-lists/hsn-codes', { token: t.pharmacist, body: { code: '30049099', description: 'Other medicaments in measured doses', gst_rate: 12 } });
  r = await call('POST', '/catalogue-drafts/bulk', { token: t.pharmacist, body: { product_ids: [D.quortanil.id, D.velmira.id, D.xantrodex.id], set: {
    category: 'S29 Smoke', hsn_code: '30049099', manufacturer_name: 'S29 Remedies Pvt Ltd', manufacturer_address: 'Plot 29, Demo Industrial Area, Pune', country_of_origin: 'India',
  } } });
  check('bulk-set of non-clinical fields (category, HSN, maker)', r.status === 200 && r.json.data?.updated === 3, r.json);

  r = await call('POST', `/catalogue-drafts/${D.quortanil.id}/approve`, { token: t.pharmacist, body: {} });
  check('approve refused until complete, saying what is missing', r.status === 400 && /drug schedule/.test(r.json.message), r.json);
  r = await call('PATCH', `/catalogue-drafts/${D.quortanil.id}`, { token: t.pharmacist, body: { hsn_code: '3004X' } });
  check('HSN format checked', invalid(r) && /HSN/.test(r.json.message), r.json);
  r = await call('PATCH', `/catalogue-drafts/${D.quortanil.id}`, { token: t.pharmacist, body: { gst_rate: 7 } });
  check('GST slab checked', invalid(r) && /GST/.test(r.json.message), r.json);
  r = await call('PATCH', `/catalogue-drafts/${D.quortanil.id}`, { token: t.pharmacist, body: {
    drug_schedule: 'OTC', generic_name: 'Quortanil', strength: '5 mg', dosage_form: 'Tablet', cold_chain: false,
  } });
  check('saved as you go; prescription derived (OTC: not needed); the description is optional (Sprint 31)', r.status === 200
    && r.json.data?.requires_prescription === 'not needed' && r.json.data.problems.length === 0
    && r.json.data.suggested_description === 'Quortanil 5 mg tablet. Pack: 10 TAB.', r.json.data);
  r = await call('PATCH', `/catalogue-drafts/${D.quortanil.id}`, { token: t.pharmacist, body: { name: 'Quortanil 5 mg Tablet', description: r.json.data.suggested_description } });
  check('ready to approve', r.status === 200 && r.json.data.problems.length === 0, r.json.data?.problems);
  r = await call('POST', `/catalogue-drafts/${D.quortanil.id}/approve`, { token: t.admin, body: {} });
  check('only a pharmacist approves (C-19)', r.status === 403, r.json);
  r = await call('POST', `/catalogue-drafts/${D.quortanil.id}/approve`, { token: t.pharmacist, body: {} });
  check('Quortanil approved: sellable, both requests linked', r.status === 200 && r.json.data?.status === 'approved' && r.json.data.requests === 2, r.json);
  const q1 = (await q('SELECT is_active, catalogue_state, content_status, content_reviewed_by FROM products WHERE id = $1', [D.quortanil.id]))[0];
  check('… active, live, copy approved by the pharmacist (same C-19 path)', q1.is_active && q1.catalogue_state === 'live'
    && q1.content_status === 'approved' && q1.content_reviewed_by === ids.pharmacist, q1);
  const audit = (await q(`SELECT action FROM audit_logs WHERE new_value->>'product_id' = $1`, [D.quortanil.id])).map((x) => x.action);
  check('… audited: details saved, copy approved, draft approved (C-46)', ['catalogue_draft_saved', 'product_copy_approved', 'catalogue_draft_approved']
    .every((x) => audit.includes(x)), audit);
  r = await call('POST', `/catalogue-drafts/${D.quortanil.id}/approve`, { token: t.pharmacist, body: {} });
  check('approving twice is refused (409)', r.status === 409, r.json);

  // Velmira: Schedule H, cold chain; flagged copy needs the pharmacist's reason
  r = await call('PATCH', `/catalogue-drafts/${D.velmira.id}`, { token: t.pharmacist, body: {
    drug_schedule: 'Schedule H', generic_name: 'Velmira', strength: '250 mg', dosage_form: 'Capsule', cold_chain: true,
    gst_rate: 12, description: 'Velmira 250 mg capsule. Cures diabetes.',
  } });
  check('Schedule H: prescription needed; cold chain needs storage text (C-25); claim flagged (C-19)',
    r.json.data?.requires_prescription === 'needed' && r.json.data.problems.some((p) => /storage/.test(p))
    && r.json.data.warnings.some((w) => /claim/.test(w)), r.json.data);
  r = await call('PATCH', `/catalogue-drafts/${D.velmira.id}`, { token: t.pharmacist, body: { storage_instructions: 'Store at 2–8 °C. Do not freeze.' } });
  r = await call('POST', `/catalogue-drafts/${D.velmira.id}/approve`, { token: t.pharmacist, body: {} });
  check('flagged copy is not approved without a reason', r.status === 400 && /flagged claims/.test(r.json.message), r.json);
  await call('PATCH', `/catalogue-drafts/${D.velmira.id}`, { token: t.pharmacist, body: { description: 'Velmira 250 mg capsule. Pack: 10 CAP.' } });
  r = await call('POST', `/catalogue-drafts/${D.velmira.id}/approve`, { token: t.pharmacist, body: {} });
  check('Velmira approved', r.status === 200 && r.json.data?.sellable === true, r.json);

  // Xantrodex: Schedule X — kept, never sellable (C-10)
  r = await call('PATCH', `/catalogue-drafts/${D.xantrodex.id}`, { token: t.pharmacist, body: { drug_schedule: 'Schedule X', generic_name: 'Xantrodex' } });
  check('Schedule X: never sold online', r.json.data?.requires_prescription === 'never sold online' && r.json.data.problems.length === 0, r.json.data);
  r = await call('POST', `/catalogue-drafts/${D.xantrodex.id}/approve`, { token: t.pharmacist, body: {} });
  check('Xantrodex approved as not listed; its request closed (C-10)', r.status === 200 && r.json.data?.status === 'not_listed' && r.json.data.sellable === false, r.json);
  const x = (await q('SELECT is_active, catalogue_state, telemedicine_list FROM products WHERE id = $1', [D.xantrodex.id]))[0];
  check('… inactive, not listed, prohibited for teleconsultation', !x.is_active && x.catalogue_state === 'not_listed' && x.telemedicine_list === 'prohibited', x);
  r = await call('PATCH', `/products/${D.xantrodex.id}`, { token: t.admin, body: { is_active: true } });
  check('… and can never be switched on (409)', r.status === 409 && /C-10/.test(r.json.message), r.json);

  // Glossor: not a medicine we list
  r = await call('POST', `/catalogue-drafts/${D.glossor.id}/reject`, { token: t.pharmacist, body: { reason: 'Cosmetic, not a medicine we list' } });
  check('Glossor rejected with a reason', r.status === 200 && r.json.data?.status === 'rejected' && r.json.data.requests === 1, r.json);
  r = await call('GET', '/admin/partner-product-requests?status=rejected', { token: t.admin });
  const closed = (r.json.data?.requests ?? []).filter((x) => x.partner_id === V.A).map((x) => `${x.item_name}: ${x.resolution_note}`);
  check('partner requests closed with the reasons', closed.some((c) => /GLOSSOR.*Cosmetic/.test(c)) && closed.some((c) => /XANTRODEX.*Schedule X.*C-10/.test(c)), closed);
  r = await call('GET', `/catalogue-drafts?company=${COM}&status=done`, { token: t.pharmacist });
  check('progress: 4 more done', r.json.data?.progress?.done === done0 + 4 && r.json.data.drafts.length === 4, r.json.data?.progress);

  console.log('\nPartner re-check matches the approved products; apply puts only those on sale');
  check('search finds the approved Quortanil (no stock yet)', (await searchNames('Quortanil')).includes('Quortanil 5 mg Tablet'));
  check('Schedule X and rejected items stay out of search', !(await searchNames('Xantrodex')).length && !(await searchNames('Glossor')).length);
  r = await call('POST', `/partner/stock-imports/${a.imp.id}/recheck`, { token: t.partnerA });
  const matched = Object.fromEntries((await rowsOf(t.partnerA, a.imp.id, 'matched')).map((x) => [x.parsed.batch_number, x.match_method]));
  check('Quortanil and Velmira lines now matched by the item link', r.status === 200 && matched.Q1 === 'item_link' && matched.Q2 === 'item_link'
    && matched.V1 === 'item_link' && Object.keys(matched).length === 3, matched);
  const left = (await rowsOf(t.partnerA, a.imp.id, 'needs_review')).map((x) => x.parsed.batch_number).sort();
  check('Glossor and Xantrodex not matched', JSON.stringify(left) === JSON.stringify(['G1', 'X1']), left);
  r = await call('POST', `/partner/stock-imports/${a.imp.id}/apply`, { token: t.partnerA, body: { catalogue_price_accepted: true } });
  check('apply without the cold-storage declaration skips Velmira (C-25)', r.status === 200
    && r.json.data?.result?.listings_created === 1 && r.json.data.result.skipped.some((s) => /cold storage/.test(s.reason)), r.json.data?.result);
  // A fresh upload of the same file with the declaration lists Velmira as well
  const again = await upload(t.partnerA, await buildMediVisionWorkbook(FILE_A, { company: 'S29 partner A (TEST)' }), 'again.xlsx');
  await call('PUT', `/partner/stock-imports/${again.json.data.id}/mapping`, { token: t.partnerA, body: { mapping: again.json.data.mapping } });
  r = await call('POST', `/partner/stock-imports/${again.json.data.id}/apply`, { token: t.partnerA, body: { catalogue_price_accepted: true, cold_chain_confirmed: true } });
  check('next upload: Velmira listed with the cold-storage declaration', r.status === 200 && r.json.data?.result?.listings_created === 1, r.json.data?.result);
  r = await call('POST', `/partner/stock-imports/${b.imp.id}/recheck`, { token: t.partnerB });
  check('partner B\'s Quortanil matches too (grouped draft)', r.status === 200 && r.json.data?.summary?.matched === 1, r.json.data);

  const listings = await q('SELECT pp.id, p.name FROM partner_products pp JOIN products p ON p.id = pp.product_id WHERE pp.partner_id = $1', [V.A]);
  check('partner A has listings for the 2 approved products only', listings.length === 2
    && listings.every((l) => ['Quortanil 5 mg Tablet', 'VELMIRA 250MG CAP'].includes(l.name)), listings);
  for (const l of listings) {
    await call('POST', `/vendors/partner-products/${l.id}/approve`, { token: t.admin });
    await call('POST', `/vendors/partner-products/${l.id}/post-live`, { token: t.admin });
  }
  check('Quortanil on sale from the partner\'s ledger (36)', await stockOf('Quortanil', 'Quortanil 5 mg Tablet') === 36);
  check('Velmira on sale (12, cold storage confirmed)', await stockOf('Velmira', 'VELMIRA 250MG CAP') === 12);
  r = await call('PUT', `/cart/items/${D.quortanil.id}`, { token: t.buyer, body: { quantity: 1 } });
  check('the approved product can be added to the cart', r.status === 200, r.json);
  const xs = await q(`SELECT COUNT(*)::int AS n FROM partner_products WHERE product_id = ANY($1)`, [[D.xantrodex.id, D.glossor.id]]);
  check('nothing listed for the Schedule X or rejected items', xs[0].n === 0, xs);
}
