// Sprint 1 end-to-end smoke test — run against a local API, Postgres and Redis.
//
//   API_URL=http://localhost:4000 DATABASE_URL=postgresql://... REDIS_URL=redis://localhost:6379 \
//     node test/sprint1.smoke.mjs
//
// Needs STORAGE_DRIVER=local on the API (no AWS). Writes test users/products
// with mobile numbers 90000000xx and SKU prefix SMOKE-; it deletes them first,
// so it can be re-run. NEVER point it at a production database.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Client } = require('pg');
const Redis = require('ioredis');

const API = (process.env.API_URL || 'http://localhost:4000') + '/api/v1';
const db = new Client({ connectionString: process.env.DATABASE_URL });
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name}${detail ? ' — ' + JSON.stringify(detail) : ''}`); }
}

async function call(method, path, { body, token, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(API + path, {
    method, headers, body: form ?? (body ? JSON.stringify(body) : undefined),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

const consent = { accept_privacy_notice: true, age_confirmed: true };
const users = {
  customer: {
    customer_type: 'customer', full_name: 'Smoke Patient', mobile: '9000000001',
    password: 'Passw0rd!', ...consent,
  },
  b2b_retailer: {
    customer_type: 'b2b_retailer', full_name: 'Smoke Retail Owner', mobile: '9000000002',
    password: 'Passw0rd!', email: 'smoke.retail@example.com', pincode: '422001',
    business_name: 'Smoke Medical Store', drug_license_type: 'dl20',
    drug_license_number: 'MH-NSK-12345', pan_number: 'abcde1234f',
    gst_unregistered_declaration: true, ...consent,
  },
  b2b_wholesaler: {
    customer_type: 'b2b_wholesaler', full_name: 'Smoke Distributor', mobile: '9000000003',
    password: 'Passw0rd!', email: 'smoke.wholesale@example.com', pincode: '422002',
    business_name: 'Smoke Pharma Distributors', drug_license_type: 'dl20b',
    drug_license_number: 'MH-NSK-W-999', gstin: '27ABCDE1234F1Z5', pan_number: 'ABCDE1234F',
    ...consent,
  },
  doc_hospital: {
    customer_type: 'doc_hospital', full_name: 'Dr. Smoke Test', mobile: '9000000004',
    password: 'Passw0rd!', pincode: '422003', nmc_reg_number: 'MMC-2011-0042',
    nmc_council_state: 'Maharashtra Medical Council', speciality: 'General Physician',
    pan_number: 'ABCDE1234F', gst_unregistered_declaration: true, ...consent,
  },
};

async function cleanup() {
  const mobiles = Object.values(users).map((u) => u.mobile);
  const ids = (await db.query('SELECT id FROM users WHERE mobile = ANY($1)', [mobiles])).rows.map((r) => r.id);
  if (ids.length) {
    for (const t of ['order_items']) {
      await db.query(`DELETE FROM ${t} WHERE order_id IN (SELECT id FROM orders WHERE user_id = ANY($1))`, [ids]);
    }
    for (const t of ['notifications', 'orders', 'addresses', 'kyc_documents', 'consent_records', 'audit_logs', 'user_profiles']) {
      await db.query(`DELETE FROM ${t} WHERE user_id = ANY($1)`, [ids]);
    }
    await db.query('DELETE FROM users WHERE id = ANY($1)', [ids]);
  }
  await db.query(`DELETE FROM inventory_batches WHERE product_id IN (SELECT id FROM products WHERE sku LIKE 'SMOKE-%')`);
  await db.query(`DELETE FROM low_stock_alerts WHERE product_id IN (SELECT id FROM products WHERE sku LIKE 'SMOKE-%')`);
  await db.query(`DELETE FROM products WHERE sku LIKE 'SMOKE-%'`);
}

async function seedProducts() {
  const insert = async (sku, name, schedule) => (await db.query(
    `INSERT INTO products (name, sku, category, drug_schedule, gst_rate, mrp_paise, offer_price_paise,
        ptr_price_paise, pts_price_paise, institutional_price_paise, max_qty_per_order,
        min_order_qty_retailer, min_order_qty_wholesaler)
     VALUES ($1,$2,'Smoke',$3,12,10000,9000,7500,7000,8200,5,1,10) RETURNING id`,
    [name, sku, schedule]
  )).rows[0].id;
  const otc = await insert('SMOKE-OTC', 'Smokeamol 500', 'OTC');
  const rx = await insert('SMOKE-RX', 'Smokecillin 250', 'Schedule H');
  const x = await insert('SMOKE-X', 'Smokezepam 1', 'Schedule X');
  for (const id of [otc, rx, x]) {
    await db.query(
      `INSERT INTO inventory_batches (product_id, batch_number, quantity_available, purchase_price_paise, expiry_date)
       VALUES ($1, 'B1', 1000, 5000, CURRENT_DATE + 365)`, [id]);
  }
  return { otc, rx, x };
}

async function registerAndVerify(u) {
  const reg = await call('POST', '/auth/register', { body: u });
  const otp = await redis.get(`otp:${u.mobile}`);
  const ver = await call('POST', '/auth/verify-otp', { body: { mobile: u.mobile, otp } });
  return { reg, ver, token: ver.json.data?.access_token };
}

async function addAddress(userId, u) {
  return (await db.query(
    `INSERT INTO addresses (user_id, full_name, mobile, address_line1, city, state, pincode)
     VALUES ($1,$2,$3,'1 Smoke Lane','Nashik','Maharashtra','422001') RETURNING id`,
    [userId, u.full_name, u.mobile]
  )).rows[0].id;
}

function pdfBlob() {
  return new Blob(['%PDF-1.4\n% smoke test\n'], { type: 'application/pdf' });
}

async function main() {
  await db.connect();
  await cleanup();
  const products = await seedProducts();

  console.log('Validation');
  let r = await call('POST', '/auth/register', { body: { ...users.b2b_retailer, gst_unregistered_declaration: false } });
  check('retailer without GSTIN or declaration is rejected (422)', r.status === 422, r.json);
  r = await call('POST', '/auth/register', { body: { ...users.b2b_wholesaler, drug_license_type: 'dl20c' } });
  check('wholesaler with old 20C licence form is rejected', r.status === 422, r.json);
  r = await call('POST', '/auth/register', { body: { ...users.customer, age_confirmed: false } });
  check('registration without 18+ confirmation is rejected', r.status === 422 && /18/.test(r.json.message), r.json);
  r = await call('POST', '/auth/register', { body: { ...users.customer, accept_privacy_notice: undefined } });
  check('registration without privacy consent is rejected', r.status === 422, r.json);

  console.log('Registration + OTP');
  const session = {};
  for (const [type, u] of Object.entries(users)) {
    const { reg, ver, token } = await registerAndVerify(u);
    check(`${type}: register 201`, reg.status === 201, reg.json);
    check(`${type}: verify-otp returns customer_type`, ver.json.data?.customer_type === type, ver.json);
    const payload = token && JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    check(`${type}: JWT carries customer_type`, payload?.customer_type === type, payload);
    const expectedKyc = type === 'customer' ? 'not_required' : 'pending_otp';
    check(`${type}: kyc_status ${expectedKyc}`, ver.json.data?.kyc_status === expectedKyc, ver.json.data);
    session[type] = { token, id: ver.json.data?.user_id, required: reg.json.data?.required_documents };
  }
  check('retailer without GSTIN needs drug_license + pan_card only',
    JSON.stringify(session.b2b_retailer.required) === JSON.stringify(['drug_license', 'pan_card']), session.b2b_retailer.required);
  const consents = (await db.query('SELECT purpose, granted FROM consent_records WHERE user_id = $1 ORDER BY purpose', [session.customer.id])).rows;
  check('consent records stored (privacy, 18+, marketing=false)',
    consents.length === 3 && consents.find((c) => c.purpose === 'marketing')?.granted === false, consents);

  console.log('KYC documents');
  r = await call('GET', '/kyc/documents', { token: session.b2b_retailer.token });
  check('GET /kyc/documents lists missing documents', r.json.data?.missing?.length === 2, r.json);
  for (const [i, doc] of ['drug_license', 'pan_card'].entries()) {
    const form = new FormData();
    form.append('document_type', doc);
    form.append('file', pdfBlob(), `${doc}.pdf`);
    r = await call('POST', '/kyc/documents', { token: session.b2b_retailer.token, form });
    check(`upload ${doc}`, r.status === 200, r.json);
    if (i === 1) check('all documents in → pending_kyc', r.json.data?.kyc_status === 'pending_kyc', r.json);
  }
  const bad = new FormData();
  bad.append('document_type', 'pan_card');
  bad.append('file', new Blob(['hello'], { type: 'text/plain' }), 'x.txt');
  r = await call('POST', '/kyc/documents', { token: session.b2b_wholesaler.token, form: bad });
  check('text file rejected', r.status === 400, r.json);
  const b2c = new FormData();
  b2c.append('document_type', 'pan_card');
  b2c.append('file', pdfBlob(), 'p.pdf');
  r = await call('POST', '/kyc/documents', { token: session.customer.token, form: b2c });
  check('B2C customer cannot upload KYC documents', r.status === 400, r.json);

  console.log('Pricing before KYC approval');
  const priceFor = async (type) => {
    const res = await call('GET', '/products/search?q=smokeamol', { token: session[type].token });
    return res.json.data?.products?.find((p) => p.sku === 'SMOKE-OTC')?.display_price_paise;
  };
  check('unapproved retailer sees B2C price', await priceFor('b2b_retailer') === 9000);
  const addr = {};
  for (const [type, u] of Object.entries(users)) addr[type] = await addAddress(session[type].id, u);
  r = await call('POST', '/orders', { token: session.b2b_retailer.token,
    body: { address_id: addr.b2b_retailer, pincode: '422001', items: [{ product_id: products.otc, quantity: 2 }] } });
  check('unapproved retailer cannot order (403)', r.status === 403, r.json);

  console.log('Pricing after KYC approval');
  await db.query(`UPDATE users SET kyc_status = 'approved' WHERE id = ANY($1)`,
    [[session.b2b_retailer.id, session.b2b_wholesaler.id, session.doc_hospital.id]]);
  const expected = { customer: 9000, b2b_retailer: 7500, b2b_wholesaler: 7000, doc_hospital: 8200 };
  for (const [type, price] of Object.entries(expected)) {
    const got = await priceFor(type);
    check(`${type} search price ${price}`, got === price, got);
  }

  const search = await call('GET', '/products/search?q=smokezepam', { token: session.customer.token });
  check('Schedule X hidden from search', search.status === 200 && !search.json.data?.products?.some((p) => p.sku === 'SMOKE-X'), search.json);

  console.log('Orders');
  const order = async (type, productId, qty) => call('POST', '/orders', { token: session[type].token,
    body: { address_id: addr[type], pincode: '422001', items: [{ product_id: productId, quantity: qty }] } });
  r = await order('b2b_retailer', products.otc, 2);
  const retailerOrder = r.json.data?.order;
  check('approved retailer order created', r.status === 201, r.json);
  const line = retailerOrder && (await db.query('SELECT unit_price_paise FROM order_items WHERE order_id = $1', [retailerOrder.id])).rows[0];
  check('retailer order line priced at PTR (7500)', line?.unit_price_paise === 7500, line);
  r = await order('customer', products.rx, 1);
  check('B2C Schedule H order requires prescription', r.status === 201 && r.json.data?.order?.requires_prescription === true, r.json);
  r = await order('b2b_retailer', products.rx, 1);
  check('retailer Schedule H order needs no prescription', r.status === 201 && r.json.data?.order?.requires_prescription === false, r.json);
  r = await order('b2b_wholesaler', products.otc, 2);
  check('wholesaler below minimum quantity (10) rejected', r.status === 400, r.json);
  r = await order('customer', products.x, 1);
  check('Schedule X order blocked', r.status === 403 || r.status === 404, r.json);

  await cleanup();
  await db.end();
  redis.disconnect();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
