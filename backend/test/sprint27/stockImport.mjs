// Sprint 27 — partner stock import: upload a MediVision-style export (synthetic),
// confirm columns, preview tabs, link an item, request a new product, apply into the
// partner's OWN ledger, availability in search, apply twice refused, other partner
// refused, mapping and links remembered on the next upload, stale drafts refused.
// Test data: mobiles 90000027xx, SKUs S27-, vendors 'S27 %', PIN 499927; removed by cleanup().
import { API, call, check, login, q, signUp } from '../sprint5/lib.mjs';
import { buildGenericCsv, buildMediVisionWorkbook } from '../fixtures/partnerStockFile.mjs';
import { licencePartner } from '../support/partnerLicences.mjs';

const PIN = '499927';
const person = (mobile, name) => ({ customer_type: 'customer', full_name: name, mobile, password: 'Passw0rd!', accept_privacy_notice: true, age_confirmed: true });
const people = {
  admin: person('9000002701', 'S27 Admin'), partnerA: person('9000002702', 'S27 Partner A'),
  partnerB: person('9000002703', 'S27 Partner B'), buyer: person('9000002704', 'S27 Buyer'),
};
// [key, sku, name, net quantity, schedule, mrp, offer, cold chain]
const PRODUCTS = [
  ['alpha', 'S27-ALPHA', 'Alphamolix 500 mg Tablet', '10 tablets', 'OTC', 3000, 2600, false],
  ['beta', 'S27-BETA', 'Betacinol 250 mg Capsule', '10 capsules', 'Schedule H', 9000, 8000, false],
  ['gamma', 'S27-GAMMA', 'Gammazolix 20 mg Tablet', '15 tablets', 'OTC', 4500, 4000, false],
  ['cold', 'S27-COLD', 'Coldivaxin 0.5 ml Injection', '1 vial', 'Schedule H', 60000, 55000, true],
  ['xray', 'S27-XRAY', 'Xenodrinol 10 mg Tablet', '10 tablets', 'Schedule X', 5000, 4500, false],
  ['zorb', 'S27-ZORB', 'Zorbexin 5 mg Injection', '1 vial', 'Schedule H', 20000, 18000, false],
];
const P = {};
const plusDays = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const monthStart = (n) => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };

export const FILE = [
  { name: 'ALPHAMOLIX 500MG TAB', unit: '10 TAB', com: 'S27R', tax: 5, batches: [
    { batch: 'A1', exp: monthStart(20), purc: 18, ptr: 21, mrp: 30, sale: 26, qty: 30 },
    { batch: 'A2', exp: monthStart(26), purc: 18, ptr: 21, mrp: 30, sale: 26, qty: 12 },
    { batch: 'A3', exp: monthStart(26), purc: 15, ptr: 17, mrp: 20, sale: 19, qty: 5 },     // MRP below Dawabag's ₹26 (C-16)
  ] },
  { name: 'BETACINOL 250MG CAP', unit: '10 CAP', com: 'S27R', tax: 12, batches: [
    { batch: 'BT-1', exp: monthStart(18), purc: 50, ptr: 60, mrp: 90, sale: 85, qty: 40 },
    { batch: 'BT-2', exp: monthStart(18), purc: 50, ptr: 60, mrp: 90, sale: 95, qty: 3 },   // selling rate above MRP (C-16)
  ] },
  { name: 'GAMMAZOLIX 20 TAB', unit: '15 TAB', com: 'S27R', tax: 5, batches: [
    { batch: 'G1', exp: monthStart(15), purc: 30, ptr: 33, mrp: 45, sale: 40, qty: 9 },
  ] },
  { name: 'COLDIVAXIN 0.5ML INJ', unit: '1 VIAL', com: 'S27R', tax: 12, batches: [
    { batch: 'C1', exp: monthStart(12), purc: 400, ptr: 450, mrp: 600, sale: 550, qty: 2 },
  ] },
  { name: 'XENODRINOL 10MG TAB', unit: '10 TAB', com: 'S27R', tax: 12, batches: [
    { batch: 'X1', exp: monthStart(12), purc: 30, ptr: 35, mrp: 50, sale: 45, qty: 4 },
  ] },
  { name: 'ZORBEXIN 5 INJ', unit: 'VIAL', com: 'S27R', tax: 12, batches: [
    { batch: 'Z1', exp: monthStart(14), purc: 120, ptr: 140, mrp: 200, sale: 180, qty: 6 },
  ] },
  { name: 'OLDMOL 100 TAB', unit: '10 TAB', com: 'S27R', tax: 5, batches: [
    { batch: 'E1', exp: '2025-01-01', purc: 5, ptr: 6, mrp: 10, sale: 9, qty: 3 },          // expired
  ] },
];

export async function cleanup() {
  const ids = (await q('SELECT id FROM users WHERE mobile = ANY($1)', [Object.values(people).map((p) => p.mobile)])).map((r) => r.id);
  const productIds = (await q(`SELECT id FROM products WHERE sku LIKE 'S27-%'`)).map((r) => r.id);
  const vendorIds = (await q(`SELECT id FROM vendors WHERE name LIKE 'S27 %'`)).map((r) => r.id);
  await q(`DELETE FROM audit_logs WHERE new_value->>'vendor_id' = ANY($1::text[]) OR new_value->>'product_id' = ANY($2::text[])`, [vendorIds, productIds]);
  await q('DELETE FROM partner_product_requests WHERE partner_id = ANY($1) OR product_id = ANY($2)', [vendorIds, productIds]);
  await q('DELETE FROM partner_item_links WHERE partner_id = ANY($1) OR product_id = ANY($2)', [vendorIds, productIds]);
  await q('DELETE FROM partner_stock_imports WHERE partner_id = ANY($1)', [vendorIds]);
  await q('DELETE FROM partner_import_mappings WHERE partner_id = ANY($1)', [vendorIds]);
  await q('DELETE FROM partner_inventory WHERE partner_id = ANY($1)', [vendorIds]);
  await q('DELETE FROM partner_products WHERE partner_id = ANY($1) OR product_id = ANY($2)', [vendorIds, productIds]);
  await q('DELETE FROM vendor_users WHERE vendor_id = ANY($1) OR user_id = ANY($2)', [vendorIds, ids]);
  await q('UPDATE audit_logs SET performed_by = NULL WHERE performed_by = ANY($1)', [ids]);
  for (const t of ['cart_items', 'carts', 'notifications', 'addresses', 'consent_records', 'audit_logs', 'user_profiles']) {
    await q(`DELETE FROM ${t} WHERE user_id = ANY($1)`, [ids]);
  }
  await q('DELETE FROM users WHERE id = ANY($1)', [ids]);
  await q('DELETE FROM vendors WHERE id = ANY($1)', [vendorIds]);
  await q('DELETE FROM inventory_batches WHERE product_id = ANY($1)', [productIds]);
  await q('DELETE FROM low_stock_alerts WHERE product_id = ANY($1)', [productIds]);
  await q('DELETE FROM products WHERE id = ANY($1)', [productIds]);
  await q('DELETE FROM pincode_serviceability WHERE pincode = $1', [PIN]);
}

export async function setup() {
  await q(`INSERT INTO pincode_serviceability (pincode, city, state, latitude, longitude, dawabag_delivery_hours, estimated_days)
           VALUES ($1, 'Pune', 'Maharashtra', 18.52, 73.85, 12, 1)`, [PIN]);
  for (const [key, sku, name, net, schedule, mrp, offer, cold] of PRODUCTS) {
    P[key] = (await q(
      `INSERT INTO products (name, generic_name, sku, category, drug_schedule, gst_rate, hsn_code, mrp_paise, offer_price_paise, max_qty_per_order,
                             net_quantity, manufacturer_name, manufacturer_address, country_of_origin, cold_chain, is_active)
       VALUES ($1, $1, $2, 'S27 Smoke', $3, 12, '30049099', $4, $5, 10, $6, 'S27 Remedies Pvt Ltd', 'Plot 27, MIDC Bhosari, Pune', 'India', $7, TRUE)
       RETURNING id`, [name, sku, schedule, mrp, offer, net, cold]))[0].id;
  }
  const ids = {};
  for (const [k, p] of Object.entries(people)) ids[k] = (await signUp(p)).user_id;
  await q(`UPDATE users SET role = 'super_admin' WHERE id = $1`, [ids.admin]);
  await q(`UPDATE users SET role = 'partner' WHERE id = ANY($1)`, [[ids.partnerA, ids.partnerB]]);
  const vendor = async (name, dl, prefix) => (await q(
    `INSERT INTO vendors (name, drug_license_no, gst_number, pincode, city, state, latitude, longitude, vendor_type, approval_status, is_active,
                          invoice_prefix, drug_license_type, drug_license_expiry)
     VALUES ($1, $2, '27ABCDE2727F1Z5', $3, 'Pune', 'Maharashtra', 18.52, 73.85, 'marketplace_partner', 'approved', TRUE, $4, 'dl20b', CURRENT_DATE + 500)
     RETURNING id`, [name, dl, PIN, prefix]))[0].id;
  const V = { A: await vendor('S27 Partner A', 'DL-S27-A', 'S27A'), B: await vendor('S27 Partner B', 'DL-S27-B', 'S27B') };
  for (const v of Object.values(V)) await licencePartner(q, v);   // Sprint 32: retail + wholesale licences
  await q('INSERT INTO vendor_users (vendor_id, user_id) VALUES ($1, $2), ($3, $4)', [V.A, ids.partnerA, V.B, ids.partnerB]);
  // Partner A already lists Betacinol (live) with two batches; BT-OLD is not in the new file
  const pp = (await q(
    `INSERT INTO partner_products (partner_id, product_id, medicine_name, drug_schedule, mrp_paise, approval_status, listing_status, catalogue_price_accepted)
     VALUES ($1, $2, 'Betacinol 250 mg Capsule', 'Schedule H', 9000, 'approved', 'live', TRUE) RETURNING id`, [V.A, P.beta]))[0].id;
  await q(`INSERT INTO partner_inventory (partner_product_id, partner_id, batch_number, qty_available, expiry_date)
           VALUES ($1, $2, 'BT-1', 5, CURRENT_DATE + 400), ($1, $2, 'BT-OLD', 20, CURRENT_DATE + 300)`, [pp, V.A]);
  // Partner B's own stock of Betacinol must never be touched by A's import
  const ppB = (await q(
    `INSERT INTO partner_products (partner_id, product_id, medicine_name, drug_schedule, mrp_paise, approval_status, listing_status, catalogue_price_accepted)
     VALUES ($1, $2, 'Betacinol 250 mg Capsule', 'Schedule H', 9000, 'approved', 'live', TRUE) RETURNING id`, [V.B, P.beta]))[0].id;
  await q(`INSERT INTO partner_inventory (partner_product_id, partner_id, batch_number, qty_available, expiry_date)
           VALUES ($1, $2, 'BT-OLD', 7, CURRENT_DATE + 300)`, [ppB, V.B]);
  const t = {};
  for (const [k, p] of Object.entries(people)) t[k] = await login(p);
  return { ids, t, V, pp, ppB };
}

async function upload(token, buffer, name) {
  const form = new FormData();
  form.append('file', new Blob([buffer]), name);
  const res = await fetch(`${API}/partner/stock-imports`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}
const rowsOf = async (token, id, status) => (await call('GET', `/partner/stock-imports/${id}/rows?status=${status}&limit=100`, { token })).json.data?.rows ?? [];
const names = (rows) => rows.map((r) => `${r.parsed?.item_name}/${r.parsed?.batch_number}`);
const stockOf = async (name) => {
  const r = await call('GET', `/products/search?q=${encodeURIComponent(name)}&limit=5`);
  return Number(r.json.data?.products?.find((p) => p.name === name)?.stock_qty ?? -1);
};

export async function run({ t, V, ids }) {
  console.log('\nUpload (in memory) and column choices');
  const xlsx = await buildMediVisionWorkbook(FILE, { company: 'S27 PARTNER A (TEST)' });
  let r = await upload(t.buyer, xlsx, 'stock.xlsx');
  check('a buyer cannot upload partner stock', r.status === 403, r.json);
  r = await upload(t.partnerA, Buffer.from('just some text'), 'stock.pdf');
  check('other file types are refused in plain words', r.status === 422 && /Excel|CSV/.test(r.json.message), r.json);
  r = await upload(t.partnerA, Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]), 'old.xls');
  check('an old binary .xls asks for Save As .xlsx / CSV', r.status === 422 && /Save As/.test(r.json.message), r.json);
  r = await upload(t.partnerA, xlsx, 'S27 stock report.xlsx');
  check('MediVision export uploaded (201)', r.status === 201, r.json);
  const imp = r.json.data;
  check('MediVision Platinum recognised and its columns chosen (preset)',
    imp?.source_software === 'MediVision Platinum (Allied Softtech)' && imp.mapping_source === 'preset' && imp.header_row === 9
    && imp.missing_fields.length === 0 && imp.mapping.quantity === 12 && imp.mapping.sale_rate === 11, imp);
  check('sample values per column for the chooser', imp?.column_samples?.[0]?.includes('ALPHAMOLIX 500MG TAB'), imp?.column_samples?.[0]);
  check('title block, totals and footer skipped; 10 stock lines', imp?.summary?.lines === 10 && imp.summary.skipped >= 8, imp?.summary);
  const fileOnDisk = await q(`SELECT COUNT(*)::int AS n FROM partner_stock_import_rows WHERE import_id = $1`, [imp.id]);
  check('rows kept in the database (nothing on disk)', fileOnDisk[0].n === imp.row_count, fileOnDisk);

  r = await call('POST', `/partner/stock-imports/${imp.id}/apply`, { token: t.partnerA, body: { catalogue_price_accepted: true } });
  check('apply refused until the columns are confirmed', r.status === 400 && /column/.test(r.json.message), r.json);
  r = await call('PUT', `/partner/stock-imports/${imp.id}/mapping`, { token: t.partnerA, body: { mapping: { ...imp.mapping, mrp: null } } });
  check('mapping without MRP refused', r.status === 400 && /MRP/.test(r.json.message), r.json);
  r = await call('PUT', `/partner/stock-imports/${imp.id}/mapping`, { token: t.partnerA, body: { mapping: { ...imp.mapping, pack: imp.mapping.item_name } } });
  check('one column cannot be two details', r.status === 400, r.json);
  r = await call('PUT', `/partner/stock-imports/${imp.id}/mapping`, { token: t.partnerA, body: { mapping: imp.mapping } });
  check('columns confirmed', r.status === 200 && r.json.data?.summary, r.json);
  const saved = await q('SELECT mapping FROM partner_import_mappings WHERE partner_id = $1', [V.A]);
  check('column choices remembered for this partner', saved[0]?.mapping?.batch_number === 'batch no', saved);

  console.log('\nPreview tabs');
  const matched = await rowsOf(t.partnerA, imp.id, 'matched');
  const review = await rowsOf(t.partnerA, imp.id, 'needs_review');
  const problems = await rowsOf(t.partnerA, imp.id, 'problem');
  check('matched: Alphamolix A1/A2 (fill-down), Betacinol BT-1, Coldivaxin C1',
    JSON.stringify(names(matched).sort()) === JSON.stringify(['ALPHAMOLIX 500MG TAB/A1', 'ALPHAMOLIX 500MG TAB/A2', 'BETACINOL 250MG CAP/BT-1', 'COLDIVAXIN 0.5ML INJ/C1']), names(matched));
  check('needs review: Gammazolix (no strength unit) and Zorbexin (not in catalogue)',
    JSON.stringify(names(review).sort()) === JSON.stringify(['GAMMAZOLIX 20 TAB/G1', 'ZORBEXIN 5 INJ/Z1']), names(review));
  const reasons = Object.fromEntries(problems.map((p) => [p.parsed.batch_number, p.problems.join(' ')]));
  check('problem: MRP below Dawabag selling price (C-16)', /below Dawabag's selling price/.test(reasons.A3 ?? ''), reasons);
  check('problem: selling rate above MRP (C-16)', /Selling rate .* above the MRP/.test(reasons['BT-2'] ?? ''), reasons);
  check('problem: Schedule X never online (C-10)', /never be sold online \(C-10\)/.test(reasons.X1 ?? ''), reasons);
  check('problem: expired', /Expired on/.test(reasons.E1 ?? ''), reasons);
  check('new listing and cold chain explained', matched.some((m) => m.warnings.some((w) => /New listing/.test(w)))
    && matched.some((m) => m.warnings.some((w) => /Refrigerated/.test(w))), matched.map((m) => m.warnings));

  console.log('\nOnly the partner reads its imports');
  r = await call('GET', `/partner/stock-imports/${imp.id}`, { token: t.partnerB });
  check('another partner cannot read the import (404)', r.status === 404, r.json);
  r = await call('GET', `/partner/stock-imports/${imp.id}/rows`, { token: t.partnerB });
  check('… nor its rows', r.status === 404, r.json);
  r = await call('POST', `/partner/stock-imports/${imp.id}/apply`, { token: t.partnerB, body: {} });
  check('… nor apply it', r.status === 404, r.json);
  r = await call('GET', `/partner/stock-imports`, { token: t.partnerB });
  check('… and it is not in their history', r.status === 200 && !r.json.data.imports.some((i) => i.id === imp.id), r.json);
  r = await call('GET', `/admin/partner-stock-imports/${imp.id}`, { token: t.admin });
  check('admin can view any partner\'s import', r.status === 200 && r.json.data?.partner_name === 'S27 Partner A', r.json);
  r = await call('GET', `/admin/partner-stock-imports/${imp.id}`, { token: t.partnerA });
  check('the admin view is for admins only', r.status === 403, r.json);

  console.log('\nLink an item; request a new product');
  const gamma = review.find((x) => x.parsed.batch_number === 'G1');
  const zorb = review.find((x) => x.parsed.batch_number === 'Z1');
  check('suggestions offered for the unmatched line', gamma?.candidates?.some((c) => c.id === P.gamma), gamma?.candidates);
  r = await call('PATCH', `/partner/stock-imports/${imp.id}/rows/${gamma.id}`, { token: t.partnerA, body: { product_id: P.xray } });
  check('cannot link to a Schedule X product (C-10)', r.status === 403, r.json);
  r = await call('PATCH', `/partner/stock-imports/${imp.id}/rows/${gamma.id}`, { token: t.partnerB, body: { product_id: P.gamma } });
  check('another partner cannot link rows', r.status === 404, r.json);
  r = await call('PATCH', `/partner/stock-imports/${imp.id}/rows/${gamma.id}`, { token: t.partnerA, body: { product_id: P.gamma } });
  check('Gammazolix linked by the partner', r.status === 200 && r.json.data?.summary?.matched === 5, r.json);
  const link = await q('SELECT source, product_id FROM partner_item_links WHERE partner_id = $1 AND item_key = $2', [V.A, gamma.item_key]);
  check('link remembered (name + unit + company)', link[0]?.product_id === P.gamma && link[0]?.source === 'manual', link);
  r = await call('POST', `/partner/stock-imports/${imp.id}/request-new-products`, { token: t.partnerA, body: {} });
  check('all remaining unmatched lines requested as new products', r.status === 200 && r.json.data?.new_requests === 1, r.json);
  r = await call('GET', '/admin/partner-product-requests', { token: t.admin });
  const req = r.json.data?.requests?.find((x) => x.partner_id === V.A);
  check('request carries name, unit, company, GST and MRP for the admin', req?.item_name === 'ZORBEXIN 5 INJ' && req.pack === 'VIAL'
    && req.manufacturer === 'S27R' && Number(req.gst_rate) === 12 && req.mrp_paise === 20000, req);

  console.log('\nApply into the partner\'s own ledger');
  const dawabagBefore = await q('SELECT COUNT(*)::int AS n FROM inventory_batches WHERE product_id = ANY($1)', [Object.values(P)]);
  r = await call('POST', `/partner/stock-imports/${imp.id}/apply`, { token: t.partnerA, body: { catalogue_price_accepted: true } });
  const res = r.json.data?.result;
  check('applied', r.status === 200 && res, r.json);
  check('2 new listings (Alphamolix, Gammazolix), 3 products updated', res?.listings_created === 2 && res.products_updated === 3, res);
  check('refrigerated item skipped without cold-storage confirmation (C-25)',
    res?.skipped?.some((s) => /cold storage/.test(s.reason) && s.products.includes('Coldivaxin 0.5 ml Injection')), res?.skipped);
  check('lines needing review / with problems reported as not applied', res?.not_applied?.problem === 4 && res.not_applied.needs_review === 1, res?.not_applied);
  const ledger = Object.fromEntries((await q(
    `SELECT p.sku || '/' || pi.batch_number AS k, pi.qty_available FROM partner_inventory pi JOIN partner_products pp ON pp.id = pi.partner_product_id
     JOIN products p ON p.id = pp.product_id WHERE pi.partner_id = $1`, [V.A])).map((x) => [x.k, x.qty_available]));
  check('ledger: batches set from the file', ledger['S27-ALPHA/A1'] === 30 && ledger['S27-ALPHA/A2'] === 12 && ledger['S27-BETA/BT-1'] === 40
    && ledger['S27-GAMMA/G1'] === 9, ledger);
  check('ledger: problem batches not written (A3, BT-2)', !('S27-ALPHA/A3' in ledger) && !('S27-BETA/BT-2' in ledger), ledger);
  check('ledger: batch missing from the file set to 0 (BT-OLD)', ledger['S27-BETA/BT-OLD'] === 0, ledger);
  const otherPartner = await q(`SELECT qty_available FROM partner_inventory WHERE partner_id = $1 AND batch_number = 'BT-OLD'`, [V.B]);
  check('other partner\'s stock untouched', otherPartner[0]?.qty_available === 7, otherPartner);
  const dawabagAfter = await q('SELECT COUNT(*)::int AS n FROM inventory_batches WHERE product_id = ANY($1)', [Object.values(P)]);
  check('Dawabag\'s own batches untouched', dawabagBefore[0].n === 0 && dawabagAfter[0].n === 0, dawabagAfter);
  const audit = await q(`SELECT new_value FROM audit_logs WHERE action = 'partner_stock_import_applied' AND new_value->>'import_id' = $1`, [imp.id]);
  check('one audit entry for the apply (C-46)', audit.length === 1 && audit[0].new_value.batches_zeroed === 1, audit);
  const auto = await q(`SELECT COUNT(*)::int AS n FROM partner_item_links WHERE partner_id = $1 AND source = 'auto'`, [V.A]);
  check('exact matches remembered as links', auto[0].n === 2, auto);

  r = await call('POST', `/partner/stock-imports/${imp.id}/apply`, { token: t.partnerA, body: { catalogue_price_accepted: true } });
  check('applying twice is refused (409)', r.status === 409 && /already been applied/.test(r.json.message), r.json);
  r = await call('PATCH', `/partner/stock-imports/${imp.id}/rows/${zorb.id}`, { token: t.partnerA, body: { product_id: P.zorb } });
  check('an applied import cannot be changed', r.status === 409, r.json);

  console.log('\nAvailability under the partner\'s ledger');
  check('Betacinol (live listing) available: 40 from the partner', await stockOf('Betacinol 250 mg Capsule') === 40);
  check('Alphamolix not available until Dawabag approves the new listing', await stockOf('Alphamolix 500 mg Tablet') === 0);
  const alphaListing = (await q('SELECT id FROM partner_products WHERE partner_id = $1 AND product_id = $2', [V.A, P.alpha]))[0].id;
  r = await call('POST', `/vendors/partner-products/${alphaListing}/approve`, { token: t.admin });
  const live = await call('POST', `/vendors/partner-products/${alphaListing}/post-live`, { token: t.admin });
  check('admin approves and posts the new listing', r.status === 200 && live.status === 200, [r.json, live.json]);
  check('Alphamolix now available: 42 from the partner\'s ledger', await stockOf('Alphamolix 500 mg Tablet') === 42);

  console.log('\nNext upload: columns and links remembered');
  r = await call('POST', `/admin/partner-product-requests/${req.id}/resolve`, { token: t.admin, body: { product_id: P.zorb } });
  check('admin links the requested item to the product created for it', r.status === 200 && r.json.data?.status === 'linked', r.json);
  const csv = buildGenericCsv(FILE.slice(0, 1));
  r = await upload(t.partnerA, csv, 'other-format.csv');
  check('a different layout gets suggested columns', r.status === 201 && r.json.data?.mapping_source === 'suggested', r.json.data);
  await call('POST', `/partner/stock-imports/${r.json.data.id}/cancel`, { token: t.partnerA });
  r = await upload(t.partnerA, xlsx, 'S27 stock report again.xlsx');
  const again = r.json.data;
  check('same headings → the saved columns are used', r.status === 201 && again?.mapping_source === 'saved', again);
  check('same file as an applied import is pointed out', !!again?.same_file_applied_at, again);
  const m2 = Object.fromEntries((await rowsOf(t.partnerA, again.id, 'matched')).map((x) => [x.parsed.batch_number, x.match_method]));
  check('Gammazolix and Zorbexin now match by the remembered link', m2.G1 === 'item_link' && m2.Z1 === 'item_link', m2);
  r = await call('POST', `/partner/stock-imports/${again.id}/cancel`, { token: t.partnerA });
  check('a draft can be cancelled', r.status === 200, r.json);
  r = await call('POST', `/partner/stock-imports/${again.id}/apply`, { token: t.partnerA, body: {} });
  check('a cancelled import cannot be applied', r.status === 409, r.json);

  r = await upload(t.partnerA, xlsx, 'stale.xlsx');
  const stale = r.json.data;
  await call('PUT', `/partner/stock-imports/${stale.id}/mapping`, { token: t.partnerA, body: { mapping: stale.mapping } });
  await q(`UPDATE partner_stock_imports SET created_at = NOW() - INTERVAL '2 days' WHERE id = $1`, [stale.id]);
  r = await call('POST', `/partner/stock-imports/${stale.id}/apply`, { token: t.partnerA, body: { catalogue_price_accepted: true, cold_chain_confirmed: true } });
  check('a file uploaded more than a day ago must be uploaded again', r.status === 409 && /Upload a fresh export/.test(r.json.message), r.json);

  r = await call('GET', '/partner/stock-imports', { token: t.partnerA });
  const hist = r.json.data?.imports ?? [];
  check('history lists the partner\'s imports with status', hist.length === 4 && hist.some((h) => h.id === imp.id && h.status === 'applied'), hist.map((h) => h.status));
  void ids;
}
