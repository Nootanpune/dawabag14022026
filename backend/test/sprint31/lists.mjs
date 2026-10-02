// Sprint 31 — "New products to complete": categories and HSN codes from managed lists
// (added with Alt+C / "+ New" through the API, audited), the description for buyers
// optional when saving and approving and added later through the C-19 copy review,
// and the "Non-scheduled" drug schedule (no prescription, sold online).
// Test data: mobiles 90000031xx, SKUs S31-, company code S31Q, categories 'S31 …',
// made-up HSN codes 993131xx; removed by cleanup(). Every name is made up.
import { call, check, login, q, signUp } from '../sprint5/lib.mjs';

const person = (mobile, name) => ({ customer_type: 'customer', full_name: name, mobile, password: 'Passw0rd!', accept_privacy_notice: true, age_confirmed: true });
const people = {
  admin: person('9000003101', 'S31 Admin'), pharmacist: person('9000003102', 'S31 Pharmacist'), buyer: person('9000003103', 'S31 Buyer'),
};
const HSN = '99313100';
const HSN_ADMIN = '99313101';
const invalid = (r) => r.status === 400 || r.status === 422;

export async function cleanup() {
  const ids = (await q('SELECT id FROM users WHERE mobile = ANY($1)', [Object.values(people).map((p) => p.mobile)])).map((r) => r.id);
  const products = (await q(`SELECT id FROM products WHERE sku LIKE 'S31-%'`)).map((r) => r.id);
  await q(`DELETE FROM audit_logs WHERE new_value->>'product_id' = ANY($1::text[]) OR new_value->>'name' LIKE 'S31 %'
           OR new_value->>'code' LIKE '993131%'`, [products]);
  await q('UPDATE audit_logs SET performed_by = NULL WHERE performed_by = ANY($1)', [ids]);
  for (const t of ['cart_items', 'carts', 'notifications', 'addresses', 'consent_records', 'audit_logs', 'user_profiles']) {
    await q(`DELETE FROM ${t} WHERE user_id = ANY($1)`, [ids]);
  }
  await q('UPDATE products SET content_reviewed_by = NULL WHERE id = ANY($1)', [products]);
  await q('DELETE FROM cart_items WHERE product_id = ANY($1)', [products]);
  await q('DELETE FROM catalogue_drafts WHERE product_id = ANY($1)', [products]);
  await q('DELETE FROM products WHERE id = ANY($1)', [products]);
  await q(`DELETE FROM product_categories WHERE name_key LIKE 's31 %'`);
  await q(`DELETE FROM hsn_codes WHERE code LIKE '993131%'`);
  await q('DELETE FROM users WHERE id = ANY($1)', [ids]);
}

async function draft(name, sku) {
  const id = (await q(
    `INSERT INTO products (name, sku, gst_rate, marketed_by, net_quantity, mrp_paise, offer_price_paise, catalogue_state, is_active,
                           drug_schedule, category)
     VALUES ($1, $2, 5, 'S31Q', '10 TAB', 4000, 4000, 'draft', FALSE, NULL, NULL) RETURNING id`, [name, sku]))[0].id;
  await q(`INSERT INTO catalogue_drafts (product_id, from_file) VALUES ($1, $2)`,
    [id, JSON.stringify({ item_name: name, pack: '10 TAB', company: 'S31Q', gst_rate: 5, mrp_paise: 4000, hsn_code: HSN })]);
  return id;
}

export async function setup() {
  const ids = {};
  for (const [k, p] of Object.entries(people)) ids[k] = (await signUp(p)).user_id;
  await q(`UPDATE users SET role = 'super_admin' WHERE id = $1`, [ids.admin]);
  await q(`UPDATE users SET role = 'pharmacist_rx' WHERE id = $1`, [ids.pharmacist]);
  const t = {};
  for (const [k, p] of Object.entries(people)) t[k] = await login(p);
  const D = { nonsched: await draft('S31 NONSCHEDA 10MG TAB', 'S31-NONSCHEDA'), other: await draft('S31 PLAINOL 5MG TAB', 'S31-PLAINOL') };
  return { ids, t, D };
}

export async function run({ ids, t, D }) {
  console.log('\nCategory list: add with Alt+C / "+ New" (API), duplicates chosen, audited');
  let r = await call('GET', '/catalogue-lists/categories', { token: t.buyer });
  check('buyers cannot read the staff lists', r.status === 403, r.json);
  r = await call('POST', '/catalogue-lists/categories', { token: t.buyer, body: { name: 'S31 Nope' } });
  check('buyers cannot add a category', r.status === 403, r.json);
  r = await call('POST', '/catalogue-lists/categories', { token: t.pharmacist, body: { name: '  S31   Smoke care ' } });
  check('a pharmacist adds "S31 Smoke care" (tidied)', r.status === 201 && r.json.data?.created === true && r.json.data.category.name === 'S31 Smoke care', r.json);
  r = await call('POST', '/catalogue-lists/categories', { token: t.admin, body: { name: 's31 SMOKE  CARE' } });
  check('the same name in other capitals is not added again: existing one chosen, with a note', r.status === 200
    && r.json.data?.created === false && r.json.data.category.name === 'S31 Smoke care' && /already in the list/.test(r.json.data.note), r.json);
  r = await call('POST', '/catalogue-lists/categories', { token: t.admin, body: { name: '7' } });
  check('a too-short name is refused in plain words', invalid(r) && /at least 2 letters/.test(r.json.message), r.json);
  r = await call('POST', '/catalogue-lists/categories', { token: t.admin, body: { name: 'S31 <script>' } });
  check('odd characters refused', invalid(r) && /letters, numbers/.test(r.json.message), r.json);
  r = await call('GET', '/catalogue-lists/categories', { token: t.pharmacist });
  check('the list shows it once', r.status === 200 && (r.json.data ?? []).filter((c) => /^s31 smoke care$/i.test(c.name)).length === 1, r.json.data?.length);
  let audit = await q(`SELECT action, performed_by FROM audit_logs WHERE action = 'product_category_created' AND new_value->>'name' = 'S31 Smoke care'`);
  check('… audited once, as the pharmacist (C-46)', audit.length === 1 && audit[0].performed_by === ids.pharmacist, audit);

  console.log('\nHSN list');
  r = await call('POST', '/catalogue-lists/hsn-codes', { token: t.pharmacist, body: { code: '9931 31 00', description: 'S31 made-up test goods', gst_rate: 12 } });
  check('a pharmacist adds HSN 99313100 (spaces removed) with GST 12%', r.status === 201 && r.json.data?.hsn?.code === HSN && r.json.data.hsn.gst_rate === 12, r.json);
  r = await call('POST', '/catalogue-lists/hsn-codes', { token: t.admin, body: { code: HSN, description: 'Other words', gst_rate: 5 } });
  check('the same code again: existing one chosen, its words and GST unchanged', r.status === 200 && r.json.data?.created === false
    && r.json.data.hsn.description === 'S31 made-up test goods' && r.json.data.hsn.gst_rate === 12, r.json);
  r = await call('POST', '/catalogue-lists/hsn-codes', { token: t.admin, body: { code: '99313', description: 'Five digits' } });
  check('HSN must be 4, 6 or 8 digits', invalid(r) && /4, 6 or 8 digits/.test(r.json.message), r.json);
  r = await call('POST', '/catalogue-lists/hsn-codes', { token: t.admin, body: { code: '993131', description: '' } });
  check('a short description is needed', invalid(r) && /short description/.test(r.json.message), r.json);
  r = await call('POST', '/catalogue-lists/hsn-codes', { token: t.admin, body: { code: '99313102', description: 'S31 bad GST', gst_rate: 7 } });
  check('GST must be a slab', invalid(r) && /GST rate/.test(r.json.message), r.json);
  r = await call('GET', '/catalogue-lists/hsn-codes', { token: t.admin });
  check('the HSN list has it', (r.json.data ?? []).some((h) => h.code === HSN && h.description === 'S31 made-up test goods'), r.json.data?.length);
  audit = await q(`SELECT 1 FROM audit_logs WHERE action = 'hsn_code_created' AND new_value->>'code' = $1`, [HSN]);
  check('… audited (C-46)', audit.length === 1, audit);

  console.log('\nThe queue uses the lists');
  r = await call('PATCH', `/catalogue-drafts/${D.nonsched}`, { token: t.pharmacist, body: { category: 'S31 Not listed' } });
  check('a category not in the list is refused, saying how to add it', r.status === 400 && /not in the category list.*Alt\+C/.test(r.json.message), r.json);
  r = await call('PATCH', `/catalogue-drafts/${D.nonsched}`, { token: t.pharmacist, body: { hsn_code: '99313199' } });
  check('an HSN not in the list is refused', r.status === 400 && /not in the HSN list/.test(r.json.message), r.json);
  r = await call('POST', '/catalogue-drafts/bulk', { token: t.pharmacist, body: { product_ids: [D.other], set: { category: 'S31 Not listed' } } });
  check('bulk-set refuses an unlisted category too', r.status === 400, r.json);
  r = await call('PATCH', `/catalogue-drafts/${D.nonsched}`, { token: t.pharmacist, body: { category: 's31 smoke CARE', hsn_code: HSN } });
  check('chosen category saved as spelled in the list; HSN chosen', r.status === 200 && r.json.data?.category === 'S31 Smoke care'
    && r.json.data.hsn_code === HSN, r.json.data);
  check('HSN usual GST 12% vs product 5%: a plain warning, GST not changed', r.json.data?.gst_rate === 5
    && r.json.data.warnings.some((w) => /HSN 99313100 usually has GST 12%, but this product is set to 5%/.test(w)), r.json.data?.warnings);

  console.log('\nNon-scheduled, saved and approved without a description');
  r = await call('GET', '/catalogue-drafts/options', { token: t.pharmacist });
  check('options offer Non-scheduled', r.json.data?.schedules?.includes('Non-scheduled'), r.json.data?.schedules);
  r = await call('PATCH', `/catalogue-drafts/${D.nonsched}`, { token: t.pharmacist, body: {
    drug_schedule: 'Non-scheduled', generic_name: 'Nonscheda', strength: '10 mg', dosage_form: 'Tablet', cold_chain: false, gst_rate: 12,
    manufacturer_name: 'S31 Remedies Pvt Ltd', manufacturer_address: 'Plot 31, Demo Industrial Area, Pune', country_of_origin: 'India',
  } });
  check('saved with no description; nothing missing; no prescription', r.status === 200 && r.json.data?.description === null
    && r.json.data.problems.length === 0 && r.json.data.requires_prescription === 'not needed'
    && !r.json.data.warnings.some((w) => /usually has GST/.test(w)), r.json.data);
  r = await call('POST', `/catalogue-drafts/${D.nonsched}/approve`, { token: t.pharmacist, body: {} });
  check('approved without a description: sellable', r.status === 200 && r.json.data?.status === 'approved' && r.json.data.sellable === true, r.json);
  const p = (await q('SELECT is_active, catalogue_state, drug_schedule, telemedicine_list, content_status, description FROM products WHERE id = $1', [D.nonsched]))[0];
  check('… active, live, Non-scheduled, copy approved, no description', p.is_active && p.catalogue_state === 'live'
    && p.drug_schedule === 'Non-scheduled' && p.content_status === 'approved' && p.description === null, p);
  check('… not put in teleconsultation List O automatically (only OTC is, C-23)', p.telemedicine_list === null, p.telemedicine_list);
  r = await call('GET', `/products/${D.nonsched}`);
  check('product page: no prescription needed', r.status === 200 && r.json.data?.requires_prescription === false && r.json.data.drug_schedule === 'Non-scheduled', r.json.data);
  r = await call('GET', '/products/search?q=Nonscheda');
  check('search finds it, shown as Non-scheduled', (r.json.data?.products ?? []).some((x) => x.id === D.nonsched && x.drug_schedule === 'Non-scheduled'
    && x.requires_prescription !== true), r.json.data?.products);
  r = await call('PUT', `/cart/items/${D.nonsched}`, { token: t.buyer, body: { quantity: 1 } });
  const cart = await call('GET', '/cart', { token: t.buyer });
  check('a buyer can add it; the cart needs no prescription', r.status === 200 && cart.json.data?.requires_prescription === false
    && cart.json.data.items.some((i) => i.product_id === D.nonsched || i.id === D.nonsched), cart.json.data);

  console.log('\nDescription added later goes through the C-19 copy review');
  r = await call('PATCH', `/catalogue-drafts/${D.nonsched}/description`, { token: t.buyer, body: { description: 'x' } });
  check('buyers cannot edit it', r.status === 403, r.json);
  r = await call('PATCH', `/catalogue-drafts/${D.nonsched}/description`, { token: t.pharmacist, body: { description: 'Nonscheda 10 mg tablet. Pack: 10 TAB.' } });
  check('description added from the queue row: saved, waiting for review', r.status === 200 && r.json.data?.description === 'Nonscheda 10 mg tablet. Pack: 10 TAB.'
    && r.json.data.content_status === 'pending_review' && r.json.data.status === 'approved', r.json.data);
  r = await call('GET', `/products/${D.nonsched}`);
  check('buyers do not see it yet (C-19)', r.status === 200 && !r.json.data?.description, r.json.data?.description);
  r = await call('GET', '/products/content-review/queue', { token: t.pharmacist });
  check('it is in the Product copy queue', (r.json.data?.products ?? []).some((x) => x.id === D.nonsched), r.json.data?.products?.length);
  audit = await q(`SELECT action FROM audit_logs WHERE new_value->>'product_id' = $1 AND action = 'product_copy_changed'`, [D.nonsched]);
  check('… change audited (C-46)', audit.length === 1, audit);
  r = await call('POST', `/products/${D.nonsched}/content-review`, { token: t.pharmacist, body: { approve: true, notes: 'Plain generic description' } });
  check('the pharmacist approves the copy', r.status === 200, r.json);
  r = await call('GET', `/products/${D.nonsched}`);
  check('now buyers see the description', r.json.data?.description === 'Nonscheda 10 mg tablet. Pack: 10 TAB.', r.json.data?.description);
  r = await call('PATCH', `/catalogue-drafts/${D.other}/description`, { token: t.pharmacist, body: { description: 'Plainol 5 mg tablet.' } });
  check('on an open draft the description is an ordinary save', r.status === 200 && r.json.data?.status === 'open'
    && r.json.data.description === 'Plainol 5 mg tablet.', r.json.data);
  r = await call('PATCH', `/catalogue-drafts/${D.other}/description`, { token: t.pharmacist, body: { description: null } });
  check('… and can be cleared again (optional)', r.status === 200 && r.json.data?.description === null, r.json.data?.description);

  console.log('\nThe product form uses the same lists');
  const base = { sku: 'S31-FORM', name: 'S31 Formol Tablet', drug_schedule: 'Non-scheduled', gst_rate: 12, mrp_paise: 5000, offer_price_paise: 4500,
    net_quantity: '10 tablets', manufacturer_name: 'S31 Remedies Pvt Ltd', manufacturer_address: 'Plot 31, Demo Industrial Area, Pune', country_of_origin: 'India' };
  r = await call('POST', '/products', { token: t.admin, body: { ...base, category: 'S31 SMOKE CARE', hsn_code: HSN_ADMIN } });
  const formId = r.json.data?.id;
  const f = formId && (await q('SELECT category, hsn_code, drug_schedule FROM products WHERE id = $1', [formId]))[0];
  check('admin product with Non-scheduled; category spelled as in the list', r.status === 201 && f?.category === 'S31 Smoke care'
    && f.drug_schedule === 'Non-scheduled', f ?? r.json);
  const hsnRow = await q('SELECT gst_rate FROM hsn_codes WHERE code = $1', [HSN_ADMIN]);
  audit = await q(`SELECT 1 FROM audit_logs WHERE action = 'hsn_code_created' AND new_value->>'code' = $1`, [HSN_ADMIN]);
  check('a new HSN from the form is added to the list, audited', hsnRow.length === 1 && hsnRow[0].gst_rate === 12 && audit.length === 1, { hsnRow, audit });
  r = await call('PATCH', `/products/${formId}`, { token: t.admin, body: { category: 'S31 Form added' } });
  const cat = await q(`SELECT c.created_by FROM product_categories c WHERE c.name = 'S31 Form added'`);
  audit = await q(`SELECT 1 FROM audit_logs WHERE action = 'product_category_created' AND new_value->>'name' = 'S31 Form added'`);
  check('a new category typed in the form is added (admins may), audited', r.status === 200 && cat.length === 1 && cat[0].created_by === ids.admin && audit.length === 1, { cat, audit });
  r = await call('POST', '/products', { token: t.admin, body: { ...base, sku: 'S31-FORM2', category: 'S31 Smoke care', drug_schedule: 'Unscheduled' } });
  check('an unknown schedule is still refused', invalid(r), r.json);
}
