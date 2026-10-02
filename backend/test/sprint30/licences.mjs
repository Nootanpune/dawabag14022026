// Sprint 30 — every drug licence of every party. A partner with 4 licences (20, 21,
// 20B, 21B) shows all 4 for the admin, in its portal and on a B2B invoice; a supplier
// with Form 25 + 20B; a retailer's KYC with 20 + 21; a wholesaler with 20B + 21B; one
// licence expired → the right block; renewals wait for the admin's check; duplicate
// numbers across businesses are refused; expiry alerts; Dawabag's own register.
// Test data (made up): mobiles 90000030xx, vendors 'S30 %', SKU S30-, PIN 499930, numbers S30-….
import { call, check, login, q, redis, signUp } from '../sprint5/lib.mjs';
import { pdfText } from './pdfText.mjs';

const PIN = '499930';
const consent = { accept_privacy_notice: true, age_confirmed: true };
const person = (mobile, name) => ({ customer_type: 'customer', full_name: name, mobile, password: 'Passw0rd!', ...consent });
const people = { admin: person('9000003001', 'S30 Admin') };
const RETAILER = '9000003002';
const WHOLESALER = '9000003003';
const PARTNER_LOGIN = '9000003011';
const plusDays = (n) => new Date(Date.now() + (n + 0.25) * 86_400_000).toISOString().slice(0, 10);

const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
function gstin(stateCode, pan) {
  const first14 = `${stateCode}${pan}1Z`;
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const p = CHARS.indexOf(first14[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(p / 36) + (p % 36);
  }
  return first14 + CHARS[(36 - (sum % 36)) % 36];
}
const GSTIN_PARTNER = gstin('27', 'AAACS3030Q');
const GSTIN_SUPPLIER = gstin('27', 'AAACS3031R');

const P4 = [
  { form: '20', licence_number: 'S30-MH-20-0001', valid_upto: plusDays(900) },
  { form: '21', licence_number: 'S30-MH-21-0002', valid_upto: plusDays(900) },
  { form: 'Form 20B', licence_number: 'S30-MH-20B-0003', valid_upto: plusDays(400), issued_by: 'FDA Maharashtra (test)' },
  { form: 'dl21b', licence_number: 'S30-MH-21B-0004', valid_upto: plusDays(700) },
];

const retailerBody = (licences) => ({ ...consent, customer_type: 'b2b_retailer', full_name: 'S30 Retail Owner', mobile: RETAILER,
  password: 'Passw0rd!', email: 's30-retail@example.test', pincode: PIN, business_name: 'S30 Test Medical Stores',
  pan_number: 'ABCPS3030K', gst_unregistered_declaration: true, licences });
const wholesalerBody = (licences) => ({ ...consent, customer_type: 'b2b_wholesaler', full_name: 'S30 Wholesale Owner', mobile: WHOLESALER,
  password: 'Passw0rd!', email: 's30-whole@example.test', pincode: PIN, business_name: 'S30 Test Distributors',
  pan_number: 'AAACS3032L', gstin: gstin('27', 'AAACS3032L'), licences });

export async function cleanup() {
  const mobiles = [...Object.values(people).map((p) => p.mobile), RETAILER, WHOLESALER, PARTNER_LOGIN];
  const ids = (await q('SELECT id FROM users WHERE mobile = ANY($1)', [mobiles])).map((r) => r.id);
  const vendorIds = (await q(`SELECT id FROM vendors WHERE name LIKE 'S30 %'`)).map((r) => r.id);
  const productIds = (await q(`SELECT id FROM products WHERE sku LIKE 'S30-%'`)).map((r) => r.id);
  const orderIds = (await q('SELECT id FROM orders WHERE user_id = ANY($1)', [ids])).map((r) => r.id);
  await q('DELETE FROM partner_order_items WHERE order_id = ANY($1) OR partner_id = ANY($2)', [orderIds, vendorIds]);
  await q('DELETE FROM payments WHERE order_id = ANY($1)', [orderIds]);
  await q('DELETE FROM order_items WHERE order_id = ANY($1)', [orderIds]);
  await q('DELETE FROM order_shipments WHERE order_id = ANY($1)', [orderIds]);
  await q('DELETE FROM orders WHERE id = ANY($1)', [orderIds]);
  await q(`DELETE FROM po_items WHERE po_id IN (SELECT id FROM purchase_orders WHERE vendor_id = ANY($1))`, [vendorIds]);
  await q('DELETE FROM purchase_orders WHERE vendor_id = ANY($1)', [vendorIds]);
  await q(`DELETE FROM audit_logs WHERE new_value->>'vendor_id' = ANY($1::text[])`, [vendorIds]);
  await q('DELETE FROM partner_inventory WHERE partner_id = ANY($1)', [vendorIds]);
  await q('DELETE FROM partner_products WHERE partner_id = ANY($1) OR product_id = ANY($2)', [vendorIds, productIds]);
  await q('DELETE FROM vendor_users WHERE vendor_id = ANY($1) OR user_id = ANY($2)', [vendorIds, ids]);
  await q('UPDATE audit_logs SET performed_by = NULL WHERE performed_by = ANY($1)', [ids]);
  await q('UPDATE vendors SET approved_by = NULL, created_by = NULL WHERE approved_by = ANY($1) OR created_by = ANY($1)', [ids]);
  await q('UPDATE vendor_pharmacists SET created_by = NULL WHERE created_by = ANY($1)', [ids]);
  await q('UPDATE job_runs SET triggered_by = NULL WHERE triggered_by = ANY($1)', [ids]);
  await q(`DELETE FROM business_licences WHERE licence_number LIKE 'S30-%'`);
  for (const t of ['kyc_verifications', 'kyc_documents', 'notifications', 'consent_records', 'audit_logs', 'addresses', 'cart_items', 'carts', 'user_profiles']) {
    await q(`DELETE FROM ${t} WHERE user_id = ANY($1)`, [ids]);
  }
  await q('DELETE FROM partner_commission_rates WHERE partner_id = ANY($1)', [vendorIds]);
  await q('DELETE FROM vendors WHERE id = ANY($1)', [vendorIds]);            // licences cascade
  await q('DELETE FROM users WHERE id = ANY($1)', [ids]);                    // licences cascade
  await q(`DELETE FROM invoice_series WHERE prefix LIKE 'S3P%'`);
  await q('DELETE FROM products WHERE id = ANY($1)', [productIds]);
  await q('DELETE FROM pincode_serviceability WHERE pincode = $1', [PIN]);
}

export async function setup() {
  await q(`INSERT INTO pincode_serviceability (pincode, city, state, latitude, longitude, dawabag_delivery_hours, estimated_days)
           VALUES ($1, 'Pune', 'Maharashtra', 18.53, 73.86, 12, 1)`, [PIN]);
  const product = (await q(
    `INSERT INTO products (name, generic_name, sku, category, drug_schedule, gst_rate, hsn_code, mrp_paise, offer_price_paise, ptr_price_paise,
                           pts_price_paise, max_qty_per_order, net_quantity, manufacturer_name, manufacturer_address, country_of_origin, is_active)
     VALUES ('S30 Licentin 500 mg Tablet', 'Licentin', 'S30-LIC', 'S30 Smoke', 'OTC', 12, '30049099', 10000, 9000, 7500, 7000, 50,
             '10 tablets', 'S30 Remedies Pvt Ltd', 'Plot 30, Test Industrial Area, Pune', 'India', TRUE) RETURNING id`))[0].id;
  const ids = { admin: (await signUp(people.admin)).user_id };
  await q(`UPDATE users SET role = 'super_admin' WHERE id = $1`, [ids.admin]);
  return { t: { admin: await login(people.admin) }, ids, product };
}

const signIn = async (mobile, password) => (await call('POST', '/auth/login', { body: { mobile, password } }));

export async function run({ t, ids, product }) {
  // ── Partner with four licences ─────────────────────────────────────────────
  console.log('\nPartner with Forms 20, 21, 20B and 21B (as printed)');
  let r = await call('POST', '/admin/partners', { token: t.admin, body: {
    legal_name: 'S30 Test Pharmaceuticals', trade_name: 'S30 Test Pharma', gstin: GSTIN_PARTNER, contact_name: 'S30 Owner',
    contact_mobile: '9000003099', address_line1: 'Shop 30, Test Market Road', city: 'Pune', state: 'Maharashtra', pincode: PIN,
    invoice_prefix: 'S3P', licences: P4, pharmacists: [{ full_name: 'S30 Pharmacist', registration_no: 'S30-MSPC-0001' }],
    logins: [{ mobile: PARTNER_LOGIN, full_name: 'S30 Partner Login', temporary_password: 'S30-temp-pass-1' }] } });
  check('partner with 4 licences created', r.status === 201, r.json);
  const vendorId = r.json.data?.vendor_id;
  const reg = await q(`SELECT form, licence_number, status, issued_by FROM party_licences WHERE vendor_id = $1 ORDER BY licence_form_rank(form)`, [vendorId]);
  check('all 4 in the register, checked', reg.length === 4 && reg.map((l) => l.form).join() === 'dl20,dl21,dl20b,dl21b'
    && reg.every((l) => l.status === 'verified') && reg[2].issued_by === 'FDA Maharashtra (test)', reg);
  const sum = (await q(`SELECT drug_license_no, drug_license_type, to_char(drug_license_expiry, 'YYYY-MM-DD') AS e FROM vendors WHERE id = $1`, [vendorId]))[0];
  check('summary: Form 20 and the earliest valid-till (20B)', sum.drug_license_no === 'S30-MH-20-0001' && sum.drug_license_type === 'dl20' && sum.e === P4[2].valid_upto, sum);
  r = await call('GET', `/admin/partners/${vendorId}`, { token: t.admin });
  const d = r.json.data;
  check('admin detail shows all 4 licences with forms and dates', d?.licences?.length === 4 && d.licences.map((l) => l.label).join() === 'Form 20,Form 21,Form 20B,Form 21B'
    && d.licences.every((l) => l.valid_upto && l.validity === 'valid') && P4.every((l) => d.licence_line.includes(l.licence_number)), d?.licences);
  r = await call('GET', '/admin/partners', { token: t.admin });
  const row = r.json.data?.partners?.find((p) => p.id === vendorId);
  check('admin list: licence count 4 and earliest valid-till, no warning', row?.licence_count === 4 && row.earliest_expiry === P4[2].valid_upto && row.expiry_warning === null, row);

  console.log('\nPartner portal: "Your drug licences"');
  r = await signIn(PARTNER_LOGIN, 'S30-temp-pass-1');
  r = await call('POST', '/auth/change-password', { token: r.json.data?.access_token, body: { current_password: 'S30-temp-pass-1', new_password: 'S30-chosen-pass-9' } });
  const partnerToken = r.json.data?.access_token;
  r = await call('GET', '/partner/me', { token: partnerToken });
  check('My business lists all 4 licences', r.status === 200 && r.json.data?.licences?.length === 4 && r.json.data.licence_count === 4, r.json);
  r = await call('GET', '/partner/licences', { token: partnerToken });
  check('partner licences: 4 checked, may trade', r.json.data?.licences?.length === 4 && r.json.data.can_trade === true, r.json.data);
  const renewalUpto = plusDays(1500);
  r = await call('POST', '/partner/licences', { token: partnerToken, body: { licences: [{ form: '20B', licence_number: 'S30-MH-20B-0003', valid_upto: renewalUpto }] } });
  check('partner sends a renewal of 20B: waits for the check', r.status === 201 && r.json.data?.licence_ids?.length === 1, r.json);
  const renewalId = r.json.data?.licence_ids?.[0];
  const still = (await q(`SELECT to_char(drug_license_expiry, 'YYYY-MM-DD') AS e FROM vendors WHERE id = $1`, [vendorId]))[0];
  check('… the summary does not move until it is checked', still.e === P4[2].valid_upto, still);
  r = await call('POST', '/partner/licences', { token: partnerToken, body: { licences: [{ form: '21', licence_number: 'S30-OLD', valid_upto: plusDays(-2) }] } });
  check('an expired "renewal" is refused', r.status === 400 && /expired on/.test(r.json.message), r.json);
  r = await call('GET', '/admin/party-licences?filter=waiting', { token: t.admin });
  check('admin work list shows the waiting renewal', r.json.data?.licences?.some((l) => l.id === renewalId && l.party_name === 'S30 Test Pharmaceuticals'), r.json.data);
  r = await call('POST', `/admin/party-licences/${renewalId}/decision`, { token: t.admin, body: { verified: true, valid_upto: renewalUpto } });
  check('admin verifies the renewal', r.status === 200 && r.json.data?.status === 'verified', r.json);
  const after = await q(`SELECT status, to_char(valid_upto, 'YYYY-MM-DD') AS u FROM party_licences WHERE vendor_id = $1 AND form = 'dl20b' ORDER BY created_at`, [vendorId]);
  const sum2 = (await q(`SELECT to_char(drug_license_expiry, 'YYYY-MM-DD') AS e FROM vendors WHERE id = $1`, [vendorId]))[0];
  check('old 20B kept as replaced; summary moves to the next earliest (21B)', after.length === 2 && after[0].status === 'superseded'
    && after[1].status === 'verified' && sum2.e === P4[3].valid_upto, { after, sum2 });

  // ── Duplicate numbers across businesses ───────────────────────────────────
  console.log('\nA licence number belongs to one business');
  r = await call('POST', '/purchasing/suppliers', { token: t.admin, body: { name: 'S30 Copycat Supplier', gst_number: GSTIN_SUPPLIER, state: 'Maharashtra',
    licences: [{ form: '20B', licence_number: 's30 mh 20b 0003', valid_upto: plusDays(300) }] } });
  check('same 20B number typed differently on a supplier → refused with the holder', r.status === 409
    && /already registered to S30 Test Pharmaceuticals/.test(r.json.message), r.json);
  r = await call('POST', '/auth/register', { body: retailerBody([{ form: '20', licence_number: 'S30-MH-20-0001' }]) });
  check('… and on a buyer sign-up, without naming the other business', r.status === 409 && /another business on Dawabag/.test(r.json.message), r.json);
  r = await call('PUT', `/admin/partners/${vendorId}`, { token: t.admin, body: { licences: P4.map((l, i) => (i === 3 ? { ...l, valid_upto: plusDays(800) } : l))
    .map((l) => (l.form === 'Form 20B' ? { ...l, valid_upto: renewalUpto } : l)) } });
  check('the same number again for the SAME partner is just an edit', r.status === 200, r.json);

  // ── Supplier with Form 25 + 20B ───────────────────────────────────────────
  console.log('\nSupplier / company with manufacturing Form 25 and wholesale 20B');
  r = await call('POST', '/purchasing/suppliers', { token: t.admin, body: { name: 'S30 Test Laboratories', gst_number: GSTIN_SUPPLIER, state: 'Maharashtra',
    licences: [{ form: '20', licence_number: 'S30-RET-ONLY', valid_upto: plusDays(300) }] } });
  check('a retail-only licence is not enough for a supplier', r.status === 400 && /wholesale \(Form 20B \/ 21B\) or manufacturing/.test(r.json.message), r.json);
  r = await call('POST', '/purchasing/suppliers', { token: t.admin, body: { name: 'S30 Test Laboratories', gst_number: GSTIN_SUPPLIER, state: 'Maharashtra',
    licences: [{ form: 'Form 25', licence_number: 'S30-MFG-25-0001', valid_upto: plusDays(600) },
      { form: '20B', licence_number: 'S30-WS-20B-0009', valid_upto: plusDays(500) }] } });
  check('supplier created with Form 25 + 20B (pending approval)', r.status === 201 && r.json.data?.approval_status === 'pending', r.json);
  const supplierId = r.json.data?.id;
  r = await call('POST', `/vendors/${supplierId}/approve`, { token: t.admin, body: { vendor_type: 'supplier' } });
  check('approved without re-entering a form (its licences are on file)', r.status === 200, r.json);
  r = await call('GET', '/purchasing/suppliers', { token: t.admin });
  const sup = r.json.data?.suppliers?.find((s) => s.id === supplierId);
  check('supplier list: both licences, count 2, can supply', sup?.licences?.length === 2 && sup.licence_count === 2 && sup.can_supply === true
    && /Form 20B: S30-WS-20B-0009/.test(sup.licence_line) && /Form 25: S30-MFG-25-0001/.test(sup.licence_line), sup);
  r = await call('POST', '/purchasing/purchase-orders', { token: t.admin, body: { vendor_id: supplierId, items: [{ product_id: product, quantity: 10, unit_cost_paise: 5000 }] } });
  check('purchase order raised', r.status === 201, r.json);
  const poId = r.json.data?.id;
  r = await call('GET', `/purchasing/purchase-orders/${poId}`, { token: t.admin });
  check('purchase order shows every supplier licence', r.json.data?.supplier_licences?.length === 2 && /S30-MFG-25-0001/.test(r.json.data.supplier_licence_line), r.json.data);
  await q(`UPDATE party_licences SET valid_upto = CURRENT_DATE - 1 WHERE vendor_id = $1 AND form = 'dl20b'`, [supplierId]);
  r = await call('POST', '/purchasing/purchase-orders', { token: t.admin, body: { vendor_id: supplierId, items: [{ product_id: product, quantity: 5, unit_cost_paise: 5000 }] } });
  check('20B expired → purchases blocked, naming that licence (C-02)', r.status === 409 && /Form 20B S30-WS-20B-0009 \(expired/.test(r.json.message), r.json);
  r = await call('POST', '/purchasing/receipts', { token: t.admin, body: { vendor_id: supplierId, supplier_invoice_no: 'S30-INV-1', supplier_invoice_date: plusDays(-1),
    lines: [{ product_id: product, batch_number: 'S30B1', expiry_date: plusDays(500), quantity: 5, unit_cost_paise: 5000, printed_mrp_paise: 10000 }] } });
  check('… and goods cannot be received from it', r.status === 409, r.json);
  r = await call('GET', '/purchasing/suppliers', { token: t.admin });
  const supAfter = r.json.data?.suppliers?.find((s) => s.id === supplierId);
  check('supplier list flags the expired licence', supAfter?.expiry_warning === 'expired' && supAfter.can_supply === false, supAfter);

  // ── Retailer KYC with 20 + 21 ─────────────────────────────────────────────
  console.log('\nRetailer signs up with Forms 20 and 21');
  r = await call('POST', '/auth/register', { body: { ...retailerBody([{ form: 'dl20b', licence_number: 'S30-R-WRONG' }]) } });
  check('a retailer without a retail licence is refused', r.status === 400 && /retail drug licence \(Form 20 or 21\)/.test(r.json.message), r.json);
  const retailer = await signUp(retailerBody([{ form: '20', licence_number: 'S30-R-20-0001' }, { form: '21', licence_number: 'S30-R-21-0002' }]));
  const retId = retailer?.user_id;
  const rl = await q(`SELECT form, status FROM party_licences WHERE user_id = $1 ORDER BY licence_form_rank(form)`, [retId]);
  check('both licences stored, waiting for the check', rl.length === 2 && rl.every((l) => l.status === 'pending'), rl);
  for (const doc of ['drug_license', 'pan_card']) {
    await q(`INSERT INTO kyc_documents (user_id, document_type, storage_key, original_name, mime_type, size_bytes)
             VALUES ($1, $2, $3, $4, 'application/pdf', 100) ON CONFLICT DO NOTHING`, [retId, doc, `kyc/${retId}/${doc}/fixture.pdf`, `${doc}.pdf`]);
  }
  await q(`UPDATE users SET kyc_status = 'pending_kyc', kyc_submitted_at = NOW() WHERE id = $1`, [retId]);
  r = await call('GET', `/kyc/admin/applications/${retId}`, { token: t.admin });
  const app = r.json.data;
  check('KYC review: one check per licence, both listed', JSON.stringify(app?.checks?.map((c) => c.check)) === JSON.stringify(['pan', 'drug_license_dl20', 'drug_license_dl21'])
    && app.licences.length === 2, app?.checks);
  await call('POST', '/kyc/admin/verify-identity', { token: t.admin, body: { user_id: retId, document_type: 'pan', verified: true } });
  const lic20 = app?.licences?.find((l) => l.form === 'dl20')?.id;
  const lic21 = app?.licences?.find((l) => l.form === 'dl21')?.id;
  r = await call('POST', `/admin/party-licences/${lic20}/decision`, { token: t.admin, body: { verified: true } });
  check('verifying without the valid-till date is refused', r.status === 400 && /valid-till/.test(r.json.message), r.json);
  r = await call('POST', `/admin/party-licences/${lic20}/decision`, { token: t.admin, body: { verified: true, valid_upto: plusDays(700) } });
  check('Form 20 verified — not active yet (Form 21 still to check)', r.status === 200 && r.json.data?.account_activated === false, r.json);
  r = await call('POST', `/admin/party-licences/${lic21}/decision`, { token: t.admin, body: { verified: true, valid_upto: plusDays(600) } });
  check('Form 21 verified → retailer active', r.json.data?.account_activated === true, r.json);
  const retToken = await login({ mobile: RETAILER, password: 'Passw0rd!' });
  r = await call('GET', '/users/me/licences', { token: retToken });
  check('"Your drug licences": both, checked, may trade', r.json.data?.licences?.length === 2 && r.json.data.licences.every((l) => l.status === 'verified')
    && r.json.data.can_trade === true, r.json.data);

  console.log('\nWholesaler signs up with Forms 20B and 21B');
  r = await call('POST', '/auth/register', { body: wholesalerBody([{ form: '20', licence_number: 'S30-W-20-0001' }]) });
  check('a wholesaler with only a retail licence is refused', r.status === 400 && /wholesale drug licence \(Form 20B or 21B\)/.test(r.json.message), r.json);
  const whole = await signUp(wholesalerBody([{ form: '20B', licence_number: 'S30-W-20B-0001' }, { form: '21B', licence_number: 'S30-W-21B-0002', valid_upto: plusDays(365) }]));
  const wl = await q(`SELECT form, to_char(valid_upto, 'YYYY-MM-DD') AS u FROM party_licences WHERE user_id = $1 ORDER BY licence_form_rank(form)`, [whole?.user_id]);
  check('wholesaler: 20B and 21B stored', wl.map((l) => l.form).join() === 'dl20b,dl21b' && wl[1].u === plusDays(365), wl);
  await q(`UPDATE users SET kyc_status = 'pending_kyc', kyc_submitted_at = NOW() WHERE id = $1`, [whole?.user_id]);   // documents in
  r = await call('GET', `/kyc/admin/queue`, { token: t.admin });
  const queued = r.json.data?.find((x) => x.user_id === whole?.user_id);
  check('KYC queue shows both licences, waiting', queued?.licences?.length === 2 && queued.pending_count === 2, queued);

  // ── B2B invoice: seller's 4 and buyer's 2 licences ─────────────────────────
  console.log('\nB2B invoice prints every licence of the seller and of the buyer (C-13)');
  const pp = (await q(`INSERT INTO partner_products (partner_id, product_id, medicine_name, approval_status, listing_status, catalogue_price_accepted)
                       VALUES ($1, $2, 'S30 Licentin', 'approved', 'live', TRUE) RETURNING id`, [vendorId, product]))[0].id;
  await q(`INSERT INTO partner_inventory (partner_id, partner_product_id, batch_number, qty_available, expiry_date) VALUES ($1, $2, 'S30-PB1', 100, CURRENT_DATE + 400)`, [vendorId, pp]);
  const addr = (await q(`INSERT INTO addresses (user_id, full_name, mobile, address_line1, city, state, pincode, is_default)
                         VALUES ($1, 'S30 Test Medical Stores', $2, '30 Test Lane', 'Pune', 'Maharashtra', $3, TRUE) RETURNING id`, [retId, RETAILER, PIN]))[0].id;
  r = await call('POST', '/orders/preview', { token: retToken, body: { address_id: addr, pincode: PIN, items: [{ product_id: product, quantity: 2 }] } });
  const block = r.json.data?.shipments?.[0];
  check('checkout preview: sold by the partner, all 4 licences', block?.seller_type === 'partner' && block.seller_licences?.length === 4
    && /Form 21B: S30-MH-21B-0004/.test(block.seller_licence), r.json.data ?? r.json);
  r = await call('POST', '/orders', { token: retToken, body: { address_id: addr, pincode: PIN, items: [{ product_id: product, quantity: 2 }] } });
  check('retailer orders from the partner', r.status === 201, r.json);
  const orderId = r.json.data?.order?.id;
  const snap = (await q(`SELECT o.buyer_drug_licences, s.seller_drug_licences, s.id AS shipment_id FROM orders o JOIN order_shipments s ON s.order_id = o.id WHERE o.id = $1`, [orderId]))[0];
  check('licences kept as on the day of sale', snap?.buyer_drug_licences?.length === 2 && snap.seller_drug_licences?.length === 4, snap);
  r = await call('GET', `/invoices/shipments/${snap?.shipment_id}.pdf`, { token: retToken, raw: true });
  const text = r.status === 200 ? pdfText(r.buf) : '';
  check('invoice PDF prints the seller\'s 4 licences', ['S30-MH-20-0001', 'S30-MH-21-0002', 'S30-MH-20B-0003', 'S30-MH-21B-0004'].every((n) => text.includes(n))
    && /Form 20B: S30-MH-20B-0003/.test(text), text.slice(0, 800));
  check('… and the buyer\'s 20 and 21', text.includes('S30-R-20-0001') && text.includes('S30-R-21-0002') && /Buyer drug licences/.test(text), text.slice(0, 800));

  // ── One licence expired → block, renewal → open again ─────────────────────
  console.log('\nOne of the retailer\'s licences expires (C-14)');
  await q(`UPDATE party_licences SET valid_upto = CURRENT_DATE - 1 WHERE user_id = $1 AND form = 'dl21' AND status = 'verified'`, [retId]);
  r = await call('POST', '/orders', { token: retToken, body: { address_id: addr, pincode: PIN, items: [{ product_id: product, quantity: 1 }] } });
  check('trade order refused on the day, naming Form 21', r.status === 403 && /Form 21 licence S30-R-21-0002 expired/.test(r.json.message), r.json);
  r = await call('POST', '/admin/jobs/licence_expiry/run', { token: t.admin });
  const st = (await q(`SELECT kyc_status FROM users WHERE id = $1`, [retId]))[0];
  check('nightly job pauses the account (pending_renewal)', st.kyc_status === 'pending_renewal', st);
  r = await call('POST', '/users/me/licences', { token: retToken, body: { licences: [{ form: '21', licence_number: 'S30-R-21-0002', valid_upto: plusDays(1000) }] } });
  check('retailer sends the renewed Form 21', r.status === 201, r.json);
  const renewed21 = r.json.data?.licence_ids?.[0];
  r = await call('GET', '/users/me/licences', { token: retToken });
  check('still paused until checked; renewal shown waiting', r.json.data?.can_trade === false && r.json.data.licences.some((l) => l.status === 'pending'), r.json.data);
  r = await call('POST', `/admin/party-licences/${renewed21}/decision`, { token: t.admin, body: { verified: true, valid_upto: plusDays(1000) } });
  check('renewal verified → account active again', r.json.data?.account_activated === true, r.json);
  r = await call('POST', '/orders/preview', { token: retToken, body: { address_id: addr, pincode: PIN, items: [{ product_id: product, quantity: 1 }] } });
  check('… and trade orders open again', r.status === 200, r.json);

  console.log('\nOne of the partner\'s licences expires (C-33)');
  await q(`UPDATE party_licences SET valid_upto = CURRENT_DATE - 1 WHERE vendor_id = $1 AND form = 'dl21' AND status = 'verified'`, [vendorId]);
  r = await call('GET', '/partner/licences', { token: partnerToken });
  check('partner sees selling paused, with the reason', r.json.data?.can_trade === false && /Form 21 licence S30-MH-21-0002 expired/.test(r.json.data.problems.join()), r.json.data);
  r = await call('POST', '/orders/preview', { token: retToken, body: { address_id: addr, pincode: PIN, items: [{ product_id: product, quantity: 1 }] } });
  check('its stock is no longer offered to buyers', r.status !== 200 || !r.json.data?.shipments?.some((s) => s.seller_type === 'partner'), r.json);
  r = await call('GET', '/admin/partners', { token: t.admin });
  check('admin list warns: licence expired', r.json.data?.partners?.find((p) => p.id === vendorId)?.expiry_warning === 'expired', r.json.data?.partners?.find((p) => p.id === vendorId));
  await q(`UPDATE party_licences SET valid_upto = CURRENT_DATE + 5, last_alert_days = NULL WHERE vendor_id = $1 AND form = 'dl21' AND status = 'verified'`, [vendorId]);

  // ── Expiry alerts ─────────────────────────────────────────────────────────
  console.log('\nExpiry alerts for partner, supplier and buyer licences');
  r = await call('POST', '/admin/jobs/party_licence_alerts/run', { token: t.admin });
  check('alert job runs', r.json.data?.status === 'succeeded' && r.json.data.summary?.alerted >= 2, r.json.data);
  const alerted = await q(`SELECT form, last_alert_days FROM party_licences WHERE (vendor_id = $1 AND form = 'dl21' OR vendor_id = $2 AND form = 'dl20b') AND status = 'verified'`, [vendorId, supplierId]);
  check('partner (5 days left → 7-day alert) and supplier (expired → 0) alerted once', alerted.length === 2
    && alerted.find((a) => a.form === 'dl21')?.last_alert_days === 7 && alerted.find((a) => a.form === 'dl20b')?.last_alert_days === 0, alerted);
  r = await call('POST', '/admin/jobs/party_licence_alerts/run', { token: t.admin });
  check('… not again the next run', r.json.data?.summary?.alerted === 0, r.json.data?.summary);

  // ── Older single licences, Dawabag's own register ─────────────────────────
  console.log('\nOlder single licences and Dawabag\'s own register');
  const old = (await q(`INSERT INTO vendors (name, drug_license_no, drug_license_type, drug_license_expiry, gst_number, state, vendor_type, approval_status, is_active)
                        VALUES ('S30 Old Supplier', 'S30-OLD-20B', 'dl20b', CURRENT_DATE + 200, $1, 'Maharashtra', 'supplier', 'approved', TRUE) RETURNING id`,
    [gstin('27', 'AAACS3033M')]))[0].id;
  r = await call('GET', '/purchasing/suppliers', { token: t.admin });
  const oldRow = r.json.data?.suppliers?.find((s) => s.id === old);
  check('a supplier with only the old single licence still shows it', oldRow?.licences?.length === 1 && oldRow.licences[0].label === 'Form 20B', oldRow);
  r = await call('POST', '/compliance/licences', { token: t.admin, body: { licence_type: 'retail_20', licence_number: 'S30-MH-20-0001', renewal_owner: 'S30 Owner', valid_upto: plusDays(300) } });
  check('Dawabag cannot register a partner\'s licence number as its own', r.status === 409, r.json);
  r = await call('POST', '/compliance/licences', { token: t.admin, body: { licence_type: 'schedule_x_20f', licence_number: 'S30-DWB-20F-1', renewal_owner: 'S30 Owner', valid_upto: plusDays(300) } });
  check('Dawabag\'s register takes the newer forms (20F)', r.status === 201 || r.status === 200, r.json);
  r = await call('GET', '/legal/info');
  check('footer licences come from the register (20F listed)', r.json.data?.drug_licences?.list?.some((l) => l.number === 'S30-DWB-20F-1' && l.label === 'Form 20F'), r.json.data?.drug_licences);
  r = await call('PUT', '/admin/settings/legal.drug_licences', { token: t.admin, body: { value: { retail_20: 'X' } } });
  check('the old footer setting is gone (one authority)', r.status === 400 || r.status === 404, r.json);
  void redis;
}
