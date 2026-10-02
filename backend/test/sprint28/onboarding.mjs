// Sprint 28 — Dawabag's admin onboards a partner pharmacy: GSTIN (format, check
// character, state) and licence checks, one transaction for partner + 4 licences +
// 2 pharmacists + 2 logins, refusal of a buyer's mobile, audit without passwords,
// forced password change at first sign-in, then Upload stock and a new listing.
// Test data (made up): mobiles 90000028xx, vendors 'S28 %', SKU S28-, PIN 499928.
import { API, call, check, login, q, signUp } from '../sprint5/lib.mjs';
import { buildMediVisionWorkbook } from '../fixtures/partnerStockFile.mjs';

const PIN = '499928';
const person = (mobile, name) => ({ customer_type: 'customer', full_name: name, mobile, password: 'Passw0rd!', accept_privacy_notice: true, age_confirmed: true });
const people = { admin: person('9000002801', 'S28 Admin'), buyer: person('9000002802', 'S28 Buyer') };
const LOGINS = ['9000002811', '9000002812', '9000002813'];
const TEMP = ['S28-temp-pass-1', 'S28-temp-pass-2', 'S28-temp-pass-3'];
const NEW_PASSWORD = 'S28-chosen-pass-9';
// Made-up GSTINs with correct check characters (standard mod-36 scheme)
const GSTIN_MH = '27AAACT2727Q1ZW';
const GSTIN_MH_TYPO = '27AAACT2727Q1ZV';
const GSTIN_KA = '29ABCDE1234F1ZW';
const plusDays = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

const LICENCES = [
  { licence_type: 'dl20', licence_number: 'S28-20-0001', valid_upto: plusDays(900) },
  { licence_type: 'dl21', licence_number: 'S28-21-0002', valid_upto: plusDays(900) },
  { licence_type: 'dl20b', licence_number: 'S28-20B-0003', valid_upto: plusDays(400) },
  { licence_type: 'dl21b', licence_number: 'S28-21B-0004', valid_upto: plusDays(700) },
];
const PHARMACISTS = [
  { full_name: 'S28 Pharmacist One', registration_no: 'S28-MSPC-0001' },
  { full_name: 'S28 Pharmacist Two', registration_no: 'S28-MSPC-0002' },
];
const body = (over = {}) => ({
  legal_name: 'S28 Test Pharma Distributors', trade_name: 'S28 Test Pharma',
  gstin: GSTIN_MH, contact_name: 'S28 Owner', contact_mobile: '9000002899', contact_email: 's28@example.test',
  address_line1: 'Shop 28, Test Market Road', address_line2: 'Near Test Chowk', city: 'Pune', state: 'Maharashtra', pincode: PIN,
  invoice_prefix: 'S28', licences: LICENCES, pharmacists: PHARMACISTS,
  logins: [
    { mobile: LOGINS[0], full_name: 'S28 Login One', temporary_password: TEMP[0] },
    { mobile: LOGINS[1], full_name: 'S28 Login Two', temporary_password: TEMP[1] },
  ],
  ...over,
});

export async function cleanup() {
  const mobiles = [...Object.values(people).map((p) => p.mobile), ...LOGINS];
  const ids = (await q('SELECT id FROM users WHERE mobile = ANY($1)', [mobiles])).map((r) => r.id);
  const vendorIds = (await q(`SELECT id FROM vendors WHERE name LIKE 'S28 %'`)).map((r) => r.id);
  const productIds = (await q(`SELECT id FROM products WHERE sku LIKE 'S28-%'`)).map((r) => r.id);
  await q(`DELETE FROM audit_logs WHERE new_value->>'vendor_id' = ANY($1::text[]) OR new_value->>'product_id' = ANY($2::text[])`, [vendorIds, productIds]);
  for (const t of ['partner_item_links', 'partner_product_requests', 'partner_stock_imports', 'partner_import_mappings', 'partner_inventory']) {
    await q(`DELETE FROM ${t} WHERE partner_id = ANY($1)`, [vendorIds]);
  }
  await q('DELETE FROM partner_products WHERE partner_id = ANY($1) OR product_id = ANY($2)', [vendorIds, productIds]);
  await q('DELETE FROM vendor_users WHERE vendor_id = ANY($1) OR user_id = ANY($2)', [vendorIds, ids]);
  await q('UPDATE audit_logs SET performed_by = NULL WHERE performed_by = ANY($1)', [ids]);
  for (const t of ['notifications', 'consent_records', 'audit_logs', 'user_profiles', 'carts']) await q(`DELETE FROM ${t} WHERE user_id = ANY($1)`, [ids]);
  await q('UPDATE vendor_licences SET created_by = NULL WHERE created_by = ANY($1)', [ids]);
  await q('UPDATE vendor_pharmacists SET created_by = NULL WHERE created_by = ANY($1)', [ids]);
  await q('UPDATE vendors SET approved_by = NULL, created_by = NULL WHERE approved_by = ANY($1) OR created_by = ANY($1)', [ids]);
  await q('DELETE FROM partner_commission_rates WHERE partner_id = ANY($1)', [vendorIds]);
  await q('DELETE FROM vendors WHERE id = ANY($1)', [vendorIds]);    // licences and pharmacists cascade
  await q('DELETE FROM users WHERE id = ANY($1)', [ids]);
  await q('DELETE FROM products WHERE id = ANY($1)', [productIds]);
  await q('DELETE FROM pincode_serviceability WHERE pincode = $1', [PIN]);
}

export async function setup() {
  await q(`INSERT INTO pincode_serviceability (pincode, city, state, latitude, longitude, dawabag_delivery_hours, estimated_days)
           VALUES ($1, 'Pune', 'Maharashtra', 18.52, 73.85, 12, 1)`, [PIN]);
  const product = (await q(
    `INSERT INTO products (name, generic_name, sku, category, drug_schedule, gst_rate, hsn_code, mrp_paise, offer_price_paise, max_qty_per_order,
                           net_quantity, manufacturer_name, manufacturer_address, country_of_origin, is_active)
     VALUES ('Septamolix 250 mg Tablet', 'Septamolix', 'S28-SEPTA', 'S28 Smoke', 'OTC', 5, '30049099', 3000, 2600, 10,
             '10 tablets', 'S28 Remedies Pvt Ltd', 'Plot 28, Test Industrial Area, Pune', 'India', TRUE) RETURNING id`))[0].id;
  const ids = {};
  for (const [k, p] of Object.entries(people)) ids[k] = (await signUp(p)).user_id;
  await q(`UPDATE users SET role = 'super_admin' WHERE id = $1`, [ids.admin]);
  const t = {};
  for (const [k, p] of Object.entries(people)) t[k] = await login(p);
  return { t, ids, product };
}

const signIn = async (mobile, password) => (await call('POST', '/auth/login', { body: { mobile, password } }));

export async function run({ t, ids, product }) {
  console.log('\nOnly Dawabag\'s managers onboard partners');
  let r = await call('POST', '/admin/partners', { token: t.buyer, body: body() });
  check('a buyer cannot add a partner (403)', r.status === 403, r.json);

  console.log('\nGSTIN, licences and logins checked before anything is saved');
  r = await call('POST', '/admin/partners', { token: t.admin, body: body({ gstin: GSTIN_MH_TYPO }) });
  check('GSTIN with a wrong check character refused in plain words', r.status === 400 && /last character does not match/.test(r.json.message), r.json);
  r = await call('POST', '/admin/partners', { token: t.admin, body: body({ gstin: '27AAACT2727Q1Z' }) });
  check('GSTIN of the wrong length refused', r.status === 400 && /15 characters/.test(r.json.message), r.json);
  r = await call('POST', '/admin/partners', { token: t.admin, body: body({ gstin: GSTIN_KA }) });
  check('Karnataka GSTIN at a Maharashtra address refused (state 27)', r.status === 400 && /state code 27/.test(r.json.message), r.json);
  r = await call('POST', '/admin/partners', { token: t.admin, body: body({ licences: [{ ...LICENCES[0], valid_upto: plusDays(-1) }, ...LICENCES.slice(1)] }) });
  check('expired licence refused with the date', r.status === 400 && /Form 20 licence S28-20-0001 expired on/.test(r.json.message), r.json);
  r = await call('POST', '/admin/partners', { token: t.admin, body: body({ pharmacists: [] }) });
  check('at least one registered pharmacist required', r.status === 400 && /registered pharmacist/.test(r.json.message), r.json);
  r = await call('POST', '/admin/partners', { token: t.admin, body: body({ invoice_prefix: 'DWB' }) });
  check('Dawabag\'s invoice prefix refused', r.status === 400 && /reserved/.test(r.json.message), r.json);
  r = await call('POST', '/admin/partners', { token: t.admin, body: body({ logins: [{ mobile: LOGINS[0], temporary_password: 'password' }] }) });
  check('weak temporary password refused', r.status === 400 && /letter and one number/.test(r.json.message), r.json);
  r = await call('POST', '/admin/partners', { token: t.admin,
    body: body({ logins: [{ mobile: LOGINS[0], temporary_password: TEMP[0] }, { mobile: people.buyer.mobile, temporary_password: TEMP[1] }] }) });
  check('a buyer\'s mobile is refused, not turned into a partner', r.status === 409 && /already registered to a Dawabag customer account/.test(r.json.message), r.json);
  const leftovers = await q(`SELECT (SELECT COUNT(*)::int FROM vendors WHERE name LIKE 'S28 %') AS v,
                                    (SELECT COUNT(*)::int FROM users WHERE mobile = $1) AS u,
                                    (SELECT role FROM users WHERE mobile = $2) AS buyer_role`, [LOGINS[0], people.buyer.mobile]);
  check('… and nothing was saved (one transaction)', leftovers[0].v === 0 && leftovers[0].u === 0 && leftovers[0].buyer_role === 'customer', leftovers);

  console.log('\nPartner with 4 licences, 2 pharmacists and 2 logins');
  r = await call('POST', '/admin/partners', { token: t.admin, body: body() });
  check('partner created (201) with two logins', r.status === 201 && r.json.data?.logins?.length === 2
    && r.json.data.logins.every((l) => l.temporary_password_set), r.json);
  const vendorId = r.json.data?.vendor_id;
  const v = (await q(`SELECT vendor_type, approval_status, kyc_status, is_active, gst_number, drug_license_no, drug_license_type,
                             to_char(drug_license_expiry, 'YYYY-MM-DD') AS expiry, invoice_prefix, latitude, address_line2
                      FROM vendors WHERE id = $1`, [vendorId]))[0];
  check('approved marketplace partner, GST-registered', v?.vendor_type === 'marketplace_partner' && v.approval_status === 'approved'
    && v.kyc_status === 'approved' && v.is_active && v.gst_number === GSTIN_MH && v.invoice_prefix === 'S28', v);
  check('licence summary: Form 20 number and the earliest valid-till (20B)', v?.drug_license_no === 'S28-20-0001' && v.drug_license_type === 'dl20'
    && v.expiry === LICENCES[2].valid_upto, v);
  check('location taken from the PIN code', Number(v?.latitude) === 18.52, v);
  const lic = await q(`SELECT licence_type, licence_number FROM vendor_licences WHERE vendor_id = $1 ORDER BY licence_type`, [vendorId]);
  check('all 4 licences in the partner licence register', lic.length === 4 && lic.map((l) => l.licence_type).join() === 'dl20,dl20b,dl21,dl21b', lic);
  const ph = await q(`SELECT full_name, registration_no FROM vendor_pharmacists WHERE vendor_id = $1 AND is_active`, [vendorId]);
  check('2 registered pharmacists stored', ph.length === 2, ph);
  const users = await q(`SELECT u.mobile, u.role, u.mobile_verified, u.must_change_password, up.full_name FROM users u
                         JOIN vendor_users vu ON vu.user_id = u.id LEFT JOIN user_profiles up ON up.user_id = u.id
                         WHERE vu.vendor_id = $1 ORDER BY u.mobile`, [vendorId]);
  check('logins: role partner, mobile verified, must change password', users.length === 2
    && users.every((u) => u.role === 'partner' && u.mobile_verified && u.must_change_password) && users[0].full_name === 'S28 Login One', users);
  const audit = await q(`SELECT action, new_value::text AS v FROM audit_logs WHERE new_value->>'vendor_id' = $1 ORDER BY id`, [vendorId]);
  check('audit: partner created + one entry per login (C-46)', audit.filter((a) => a.action === 'partner_created').length === 1
    && audit.filter((a) => a.action === 'partner_login_created').length === 2, audit.map((a) => a.action));
  const leaked = await q(`SELECT COUNT(*)::int AS n FROM audit_logs WHERE new_value::text LIKE '%' || $1 || '%' OR old_value::text LIKE '%' || $1 || '%'`, ['S28-temp-pass']);
  check('no temporary password in the audit trail', leaked[0].n === 0, leaked);

  r = await call('POST', '/admin/partners', { token: t.admin, body: body({ legal_name: 'S28 Second Pharmacy', gstin: '27ABCDE1234F1Z0',
    licences: [{ licence_type: 'dl20', licence_number: 'S28-20-9999', valid_upto: plusDays(300) }],
    logins: [{ mobile: LOGINS[2], temporary_password: TEMP[2] }] }) });
  check('the same invoice prefix cannot be used twice', r.status === 409 && /already used by S28 Test Pharma Distributors/.test(r.json.message), r.json);
  r = await call('POST', '/admin/partners', { token: t.admin, body: body({ legal_name: 'S28 Second Pharmacy', invoice_prefix: 'S28X',
    logins: [{ mobile: LOGINS[2], temporary_password: TEMP[2] }] }) });
  check('the same GSTIN cannot be onboarded twice', r.status === 409 && /already exists/.test(r.json.message), r.json);

  r = await call('GET', '/admin/partners', { token: t.admin });
  const listed = r.json.data?.partners?.find((p) => p.id === vendorId);
  check('partner listed for the admin with its licences and logins', listed?.licence_types?.length === 4 && listed.logins.length === 2
    && listed.pharmacists === 2, listed);
  r = await call('GET', `/admin/partners/${vendorId}`, { token: t.admin });
  const d = r.json.data;
  check('detail: licences, pharmacists, logins, may sell retail and wholesale', r.status === 200 && d.licences.length === 4
    && d.pharmacists.length === 2 && d.logins.length === 2 && d.selling_rights.retail && d.selling_rights.wholesale
    && d.licences[0].licence_type === 'dl20' && d.licences.every((l) => l.status === 'verified' && l.validity === 'valid'), d);

  console.log('\nFirst sign-in: the temporary password must be changed');
  r = await signIn(LOGINS[0], TEMP[0]);
  check('partner signs in with the temporary password', r.status === 200 && r.json.data?.role === 'partner' && r.json.data.must_change_password === true, r.json);
  const tempToken = r.json.data?.access_token;
  r = await call('GET', '/partner/me', { token: tempToken });
  check('nothing else opens until the password is changed', r.status === 403 && r.json.code === 'PASSWORD_CHANGE_REQUIRED', r.json);
  r = await call('GET', '/partner/stock-imports', { token: tempToken });
  check('… not even Upload stock', r.status === 403 && r.json.code === 'PASSWORD_CHANGE_REQUIRED', r.json);
  r = await call('POST', '/auth/change-password', { token: tempToken, body: { current_password: 'wrong-one-1', new_password: NEW_PASSWORD } });
  check('wrong current password refused', r.status === 400 && /current password is not right/.test(r.json.message), r.json);
  r = await call('POST', '/auth/change-password', { token: tempToken, body: { current_password: TEMP[0], new_password: TEMP[0] } });
  check('the temporary password cannot be kept', r.status === 400 && /different/.test(r.json.message), r.json);
  r = await call('POST', '/auth/change-password', { token: tempToken, body: { current_password: TEMP[0], new_password: 'short1' } });
  check('a weak new password is refused', r.status === 400 && /at least 8/.test(r.json.message), r.json);
  r = await call('POST', '/auth/change-password', { token: tempToken, body: { current_password: TEMP[0], new_password: NEW_PASSWORD } });
  check('password changed; a new session is issued', r.status === 200 && r.json.data?.must_change_password === false && r.json.data.access_token, r.json);
  const partnerToken = r.json.data?.access_token;
  r = await call('GET', '/partner/me', { token: tempToken });
  check('the old session no longer works', r.status === 401, r.json);
  const flag = await q(`SELECT must_change_password, password_changed_at FROM users WHERE mobile = $1`, [LOGINS[0]]);
  check('flag cleared and time recorded', flag[0].must_change_password === false && !!flag[0].password_changed_at, flag);
  const pwAudit = await q(`SELECT new_value FROM audit_logs WHERE action = 'password_changed' AND user_id = (SELECT id FROM users WHERE mobile = $1)`, [LOGINS[0]]);
  check('password change audited without the password', pwAudit.length === 1 && pwAudit[0].new_value.temporary_password_replaced === true
    && !JSON.stringify(pwAudit).includes('S28-'), pwAudit);
  r = await signIn(LOGINS[0], TEMP[0]);
  check('the temporary password no longer signs in', r.status === 401, r.json);
  r = await signIn(LOGINS[0], NEW_PASSWORD);
  check('the new password signs in, nothing more to change', r.status === 200 && r.json.data?.must_change_password === false, r.json);

  console.log('\nUpload stock and list, as a GST-registered partner (C-33)');
  r = await call('GET', '/partner/me', { token: partnerToken });
  check('partner portal opens with the GSTIN and licence', r.status === 200 && r.json.data?.gst_number === GSTIN_MH && r.json.data.drug_license_no === 'S28-20-0001', r.json);
  r = await call('GET', '/partner/stock-imports', { token: partnerToken });
  check('Upload stock opens', r.status === 200 && Array.isArray(r.json.data?.imports), r.json);
  const month = (n) => { const x = new Date(); x.setUTCDate(1); x.setUTCMonth(x.getUTCMonth() + n); return x.toISOString().slice(0, 10); };
  const xlsx = await buildMediVisionWorkbook([{ name: 'SEPTAMOLIX 250MG TAB', unit: '10 TAB', com: 'S28R', tax: 5, batches: [
    { batch: 'S28B1', exp: month(18), purc: 18, ptr: 21, mrp: 30, sale: 26, qty: 25 }] }], { company: 'S28 TEST PHARMA (TEST)' });
  const form = new FormData();
  form.append('file', new Blob([xlsx]), 'stock.xlsx');
  const up = await fetch(`${API}/partner/stock-imports`, { method: 'POST', headers: { Authorization: `Bearer ${partnerToken}` }, body: form });
  const imp = (await up.json().catch(() => ({}))).data;
  check('stock file uploaded (201)', up.status === 201 && imp?.id, imp);
  r = await call('PUT', `/partner/stock-imports/${imp?.id}/mapping`, { token: partnerToken, body: { mapping: imp?.mapping } });
  check('columns confirmed', r.status === 200, r.json);
  r = await call('POST', `/partner/stock-imports/${imp?.id}/apply`, { token: partnerToken, body: { catalogue_price_accepted: true } });
  check('applied: a new listing is allowed because the partner is GST-registered', r.status === 200 && r.json.data?.result?.listings_created === 1, r.json);
  const ledger = await q(`SELECT qty_available FROM partner_inventory WHERE partner_id = $1 AND batch_number = 'S28B1'`, [vendorId]);
  check('stock in the partner\'s own ledger', ledger[0]?.qty_available === 25, ledger);

  console.log('\nEdit: renew a licence, change pharmacists');
  const renewed = LICENCES.map((l) => (l.licence_type === 'dl20b' ? { ...l, valid_upto: plusDays(1000) } : l));
  r = await call('PUT', `/admin/partners/${vendorId}`, { token: t.admin, body: { licences: renewed,
    pharmacists: [PHARMACISTS[0], { full_name: 'S28 Pharmacist Three', registration_no: 'S28-MSPC-0003' }] } });
  check('partner edited', r.status === 200, r.json);
  const after = (await q(`SELECT to_char(drug_license_expiry, 'YYYY-MM-DD') AS expiry FROM vendors WHERE id = $1`, [vendorId]))[0];
  check('summary expiry follows the renewal (now 21B is the earliest)', after.expiry === LICENCES[3].valid_upto, after);
  const ph2 = await q(`SELECT registration_no, is_active FROM vendor_pharmacists WHERE vendor_id = $1 ORDER BY registration_no`, [vendorId]);
  check('pharmacist removed from the list is kept inactive (history)', ph2.length === 3 && ph2.find((p) => p.registration_no === 'S28-MSPC-0002')?.is_active === false, ph2);
  r = await call('PUT', `/admin/partners/${vendorId}`, { token: t.admin, body: { licences: [{ ...LICENCES[0], valid_upto: plusDays(-3) }] } });
  check('an expired licence is refused on edit too', r.status === 400 && /expired on/.test(r.json.message), r.json);
  r = await call('PUT', `/admin/partners/${vendorId}`, { token: t.admin, body: { state: 'Karnataka' } });
  check('moving the address out of the GSTIN\'s state is refused', r.status === 400 && /state code 29/.test(r.json.message), r.json);
  r = await call('PUT', `/admin/partners/${vendorId}`, { token: t.admin, body: { licences: [LICENCES[2], LICENCES[3]] } });
  const rights = (await call('GET', `/admin/partners/${vendorId}`, { token: t.admin })).json.data?.selling_rights;
  check('wholesale-only licences → wholesale rights only', r.status === 200 && rights?.retail === false && rights.wholesale === true, rights);
  await call('PUT', `/admin/partners/${vendorId}`, { token: t.admin, body: { licences: LICENCES } });
  r = await call('PUT', `/admin/partners/${vendorId}`, { token: t.buyer, body: { city: 'Elsewhere' } });
  check('a buyer cannot edit a partner', r.status === 403, r.json);
  const editAudit = await q(`SELECT COUNT(*)::int AS n FROM audit_logs WHERE action = 'partner_updated' AND new_value->>'vendor_id' = $1`, [vendorId]);
  check('edits audited', editAudit[0].n === 3, editAudit);

  console.log('\nAnother login later');
  r = await call('POST', `/admin/partners/${vendorId}/logins`, { token: t.admin, body: { mobile: people.buyer.mobile, temporary_password: TEMP[2] } });
  check('a buyer\'s mobile is refused as a login', r.status === 409 && /customer account/.test(r.json.message), r.json);
  r = await call('POST', `/admin/partners/${vendorId}/logins`, { token: t.admin, body: { mobile: LOGINS[1], temporary_password: TEMP[2] } });
  check('an existing login of this partner is pointed out', r.status === 409 && /already a login for this partner/.test(r.json.message), r.json);
  r = await call('POST', `/admin/partners/${vendorId}/logins`, { token: t.admin, body: { mobile: LOGINS[2], full_name: 'S28 Login Three', temporary_password: TEMP[2] } });
  check('third login added (201)', r.status === 201 && r.json.data?.temporary_password_set === true, r.json);
  r = await signIn(LOGINS[2], TEMP[2]);
  check('… and it too must change its password first', r.status === 200 && r.json.data?.must_change_password === true, r.json);

  console.log('\nGST registration is what lets a partner list (C-33)');
  await q(`UPDATE vendors SET gst_number = NULL WHERE id = $1`, [vendorId]);
  r = await call('POST', '/partner/products', { token: partnerToken, body: { product_id: product, catalogue_price_accepted: true } });
  check('without a GSTIN a new listing is refused', r.status === 403 && /GST registration is required/.test(r.json.message), r.json);
  await q(`UPDATE vendors SET gst_number = $2 WHERE id = $1`, [vendorId, GSTIN_MH]);
}
