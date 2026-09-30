// Sprint 2 end-to-end smoke test — KYC review, credit, scheduled jobs, server
// cart and web session cookies. Run against a local API + Postgres + Redis:
//
//   API_URL=http://localhost:4000 DATABASE_URL=postgresql://... REDIS_URL=redis://... \
//     node test/sprint2.smoke.mjs
//
// Uses mobiles 90000001xx and SKU prefix S2-; cleans them up before and after.
// NEVER point it at a production database. KYC document files need S3; without
// AWS_S3_BUCKET on the API the test seeds kyc_documents rows directly.
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
  else { failures++; console.log(`  FAIL ${name}${detail !== undefined ? ' — ' + JSON.stringify(detail).slice(0, 400) : ''}`); }
}

async function call(method, path, { body, token, headers = {}, cookie } = {}) {
  const h = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  if (body) h['Content-Type'] = 'application/json';
  if (cookie) h.Cookie = cookie;
  const res = await fetch(API + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json, setCookie: res.headers.get('set-cookie') };
}

const consent = { accept_privacy_notice: true, age_confirmed: true };
const people = {
  admin: { customer_type: 'customer', full_name: 'S2 Admin', mobile: '9000000101', password: 'Passw0rd!', ...consent },
  retailer: {
    customer_type: 'b2b_retailer', full_name: 'S2 Retailer', mobile: '9000000102', password: 'Passw0rd!',
    email: 's2.retail@example.com', pincode: '422001', business_name: 'S2 Medical',
    drug_license_type: 'dl20', drug_license_number: 'MH-S2-001', pan_number: 'ABCDE1234F',
    gst_unregistered_declaration: true, ...consent,
  },
  doctor: {
    customer_type: 'doc_hospital', full_name: 'Dr. S2', mobile: '9000000103', password: 'Passw0rd!',
    pincode: '422003', nmc_reg_number: 'MMC-S2-01', nmc_council_state: 'Maharashtra Medical Council',
    speciality: 'General Physician', pan_number: 'ABCDE1234G', gst_unregistered_declaration: true, ...consent,
  },
  wholesaler: {
    customer_type: 'b2b_wholesaler', full_name: 'S2 Wholesale', mobile: '9000000104', password: 'Passw0rd!',
    email: 's2.wholesale@example.com', pincode: '422002', business_name: 'S2 Distributors',
    drug_license_type: 'dl20b', drug_license_number: 'MH-S2-W1', gstin: '27ABCDE1234F1Z5',
    pan_number: 'ABCDE1234H', ...consent,
  },
  patient: { customer_type: 'customer', full_name: 'S2 Patient', mobile: '9000000105', password: 'Passw0rd!', ...consent },
};

async function cleanup() {
  const mobiles = Object.values(people).map((p) => p.mobile);
  const ids = (await db.query('SELECT id FROM users WHERE mobile = ANY($1)', [mobiles])).rows.map((r) => r.id);
  if (ids.length) {
    await db.query('DELETE FROM credit_reminders WHERE order_id IN (SELECT id FROM orders WHERE user_id = ANY($1))', [ids]);
    await db.query('DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE user_id = ANY($1))', [ids]);
    await db.query('UPDATE job_runs SET triggered_by = NULL WHERE triggered_by = ANY($1)', [ids]);
    await db.query('UPDATE audit_logs SET performed_by = NULL WHERE performed_by = ANY($1)', [ids]);
    await db.query('UPDATE orders SET credit_settled_by = NULL WHERE credit_settled_by = ANY($1)', [ids]);
    await db.query('UPDATE kyc_verifications SET verified_by_admin_id = NULL WHERE verified_by_admin_id = ANY($1)', [ids]);
    for (const t of ['cart_items', 'carts', 'notifications', 'orders', 'addresses', 'kyc_documents',
      'kyc_verifications', 'consent_records', 'audit_logs', 'user_profiles']) {
      await db.query(`DELETE FROM ${t} WHERE user_id = ANY($1)`, [ids]);
    }
    await db.query('DELETE FROM users WHERE id = ANY($1)', [ids]);
  }
  await db.query(`DELETE FROM low_stock_alerts WHERE product_id IN (SELECT id FROM products WHERE sku LIKE 'S2-%')`);
  await db.query(`DELETE FROM inventory_batches WHERE product_id IN (SELECT id FROM products WHERE sku LIKE 'S2-%')`);
  await db.query(`DELETE FROM cart_items WHERE product_id IN (SELECT id FROM products WHERE sku LIKE 'S2-%')`);
  await db.query(`DELETE FROM products WHERE sku LIKE 'S2-%'`);
  await db.query(`DELETE FROM coupons WHERE code = 'S2TEST10'`);
}

async function signUp(p, { web = false } = {}) {
  await call('POST', '/auth/register', { body: p });
  const otp = await redis.get(`otp:${p.mobile}`);
  return call('POST', '/auth/verify-otp', {
    body: { mobile: p.mobile, otp }, headers: web ? { 'X-Client': 'web' } : {},
  });
}

async function login(p) {
  const r = await call('POST', '/auth/login', { body: { mobile: p.mobile, password: p.password } });
  return r.json.data?.access_token;
}

async function seedDocs(userId, types) {
  for (const t of types) {
    await db.query(
      `INSERT INTO kyc_documents (user_id, document_type, storage_key, original_name, mime_type, size_bytes)
       VALUES ($1, $2, $3, $4, 'application/pdf', 100) ON CONFLICT DO NOTHING`,
      [userId, t, `kyc/${userId}/${t}/fixture.pdf`, `${t}.pdf`]);
  }
  await db.query(`UPDATE users SET kyc_status = 'pending_kyc', kyc_submitted_at = NOW() WHERE id = $1`, [userId]);
}

async function main() {
  await db.connect();
  await cleanup();

  // Products: OTC with stock, Rx with stock, low-stock product
  const product = async (sku, schedule, stock, reorder = 10) => {
    const id = (await db.query(
      `INSERT INTO products (name, sku, category, drug_schedule, mrp_paise, offer_price_paise,
         ptr_price_paise, pts_price_paise, institutional_price_paise, max_qty_per_order, reorder_level_qty)
       VALUES ($1, $1, 'Smoke', $2, 10000, 9000, 7500, 7000, 8200, 50, $3) RETURNING id`,
      [sku, schedule, reorder])).rows[0].id;
    if (stock) {
      await db.query(
        `INSERT INTO inventory_batches (product_id, batch_number, quantity_available, purchase_price_paise, expiry_date)
         VALUES ($1, 'B1', $2, 5000, CURRENT_DATE + 365)`, [id, stock]);
    }
    return id;
  };
  const otc = await product('S2-OTC', 'OTC', 1000);
  const rx = await product('S2-RX', 'Schedule H', 1000);
  const low = await product('S2-LOW', 'OTC', 3, 20);
  await db.query(`INSERT INTO coupons (code, type, value) VALUES ('S2TEST10', 'percentage', 10)`);

  console.log('Web session cookie');
  const pv = await signUp(people.patient, { web: true });
  const cookie = pv.setCookie?.split(';')[0];
  check('verify-otp (web) sets httpOnly cookie, no refresh_token in body',
    /HttpOnly/i.test(pv.setCookie || '') && !('refresh_token' in (pv.json.data || {})), pv.setCookie);
  let r = await call('POST', '/auth/refresh', { headers: { 'X-Client': 'web' }, cookie });
  check('refresh with cookie restores session + account state',
    r.status === 200 && r.json.data?.customer_type === 'customer' && !!r.json.data?.access_token, r.json);
  r = await call('POST', '/auth/refresh', { headers: { 'X-Client': 'web' }, cookie });
  check('rotated (old) cookie is rejected', r.status === 401, r.json);
  r = await call('POST', '/auth/refresh', { cookie });
  check('cookie without X-Client header is refused', r.status === 401, r.json);

  console.log('Server cart');
  const patientToken = await login(people.patient);
  r = await call('PUT', `/cart/items/${otc}`, { token: patientToken, body: { quantity: 2 } });
  check('add OTC ×2 → server prices it at offer price', r.json.data?.subtotal_paise === 18000, r.json);
  r = await call('PUT', `/cart/items/${rx}`, { token: patientToken, body: { quantity: 1 } });
  check('cart flags prescription needed', r.json.data?.requires_prescription === true, r.json);
  r = await call('PUT', '/cart/coupon', { token: patientToken, body: { code: 's2test10' } });
  check('coupon discount only on non-Rx lines (10% of 18000)', r.json.data?.discount_paise === 1800, r.json.data?.coupon);
  await call('PUT', `/cart/items/${otc}`, { token: patientToken, body: { quantity: 0 } });
  r = await call('GET', '/cart', { token: patientToken });
  check('coupon invalid on Rx-only cart (C-21)', r.json.data?.coupon?.valid === false, r.json.data?.coupon);
  r = await call('GET', '/cart');
  check('cart needs sign-in', r.status === 401, r.json);

  console.log('KYC review');
  const adminV = await signUp(people.admin);
  const adminId = adminV.json.data.user_id;
  await db.query(`UPDATE users SET role = 'super_admin' WHERE id = $1`, [adminId]);
  const admin = await login(people.admin);

  const ret = (await signUp(people.retailer)).json.data;
  const doc = (await signUp(people.doctor)).json.data;
  const whs = (await signUp(people.wholesaler)).json.data;
  await seedDocs(ret.user_id, ['drug_license', 'pan_card']);
  await seedDocs(doc.user_id, ['nmc_certificate', 'pan_card']);
  await seedDocs(whs.user_id, ['drug_license', 'gst_certificate', 'pan_card', 'cancelled_cheque']);

  r = await call('GET', '/kyc/admin/queue', { token: admin });
  check('queue lists the three applicants', [ret, doc, whs].every((u) => r.json.data?.some((q) => q.user_id === u.user_id)), r.json);
  r = await call('GET', '/kyc/admin/queue', { token: patientToken });
  check('buyer cannot see the KYC queue', r.status === 403, r.json);

  r = await call('GET', `/kyc/admin/applications/${ret.user_id}`, { token: admin });
  check('application shows checks pan + drug_license_dl20 pending',
    JSON.stringify(r.json.data?.checks?.map((c) => [c.check, c.result])) === JSON.stringify([['pan', 'pending'], ['drug_license_dl20', 'pending']]), r.json.data?.checks);
  const docId = r.json.data?.documents?.[0]?.id;
  r = await call('GET', `/kyc/admin/documents/${docId}/url`, { token: admin });
  check('document link needs S3 (503 when not configured) or returns a URL',
    r.status === 503 || (r.status === 200 && r.json.data?.url), r.json);

  r = await call('POST', '/kyc/admin/verify-identity', { token: admin, body: { user_id: ret.user_id, document_type: 'pan', verified: true } });
  check('PAN verified alone does not activate', r.json.data?.account_activated === false, r.json);
  r = await call('POST', '/kyc/admin/verify-drug-license', { token: admin, body: {
    user_id: ret.user_id, dl_number: 'MH-S2-001', dl_type: 'DL-20', verified: true,
    valid_upto: new Date(Date.now() + 400 * 864e5).toISOString().slice(0, 10) } });
  check('licence verified → retailer activated', r.json.data?.account_activated === true, r.json);
  const retailer = await login(people.retailer);
  r = await call('GET', '/products/search?q=S2-OTC', { token: retailer });
  check('approved retailer now sees PTR', r.json.data?.products?.find((p) => p.sku === 'S2-OTC')?.display_price_paise === 7500, r.json.data?.products);

  r = await call('POST', '/kyc/admin/verify-nmc', { token: admin, body: {
    user_id: doc.user_id, nmc_number: 'MMC-S2-01', council_state: 'Maharashtra', verified: true } });
  check('NMC verified without PAN does NOT activate (old count bug)', r.json.data?.account_activated === false, r.json);
  r = await call('POST', '/kyc/admin/verify-identity', { token: admin, body: { user_id: doc.user_id, document_type: 'pan', verified: true } });
  check('NMC + PAN → doctor activated', r.json.data?.account_activated === true, r.json);

  r = await call('POST', '/kyc/admin/reject', { token: admin, body: { user_id: whs.user_id, reason: 'Licence copy unreadable' } });
  const whsRow = (await db.query('SELECT kyc_status, kyc_rejection_reason FROM users WHERE id = $1', [whs.user_id])).rows[0];
  check('application rejected with reason', whsRow.kyc_status === 'rejected' && whsRow.kyc_rejection_reason === 'Licence copy unreadable', whsRow);
  const audit = (await db.query(`SELECT action FROM audit_logs WHERE user_id = ANY($1)`, [[ret.user_id, doc.user_id, whs.user_id]])).rows.map((a) => a.action);
  check('audit log has check, approval and rejection entries',
    ['kyc_check_verified', 'kyc_approved', 'kyc_rejected'].every((a) => audit.includes(a)), audit);

  console.log('Credit');
  const addr = (await db.query(
    `INSERT INTO addresses (user_id, full_name, mobile, address_line1, city, state, pincode)
     VALUES ($1, 'S2', '9000000102', '1 Lane', 'Nashik', 'Maharashtra', '422001') RETURNING id`, [ret.user_id])).rows[0].id;
  const creditOrder = (qty) => call('POST', '/orders', { token: retailer, body: {
    address_id: addr, pincode: '422001', payment_terms: 'net_7', items: [{ product_id: otc, quantity: qty }] } });
  r = await creditOrder(1);
  check('no credit limit → net_7 order refused', r.status === 400, r.json);
  r = await call('PATCH', `/admin/users/${ret.user_id}/credit`, { token: admin, body: { credit_limit_paise: 50000 } });
  check('admin sets ₹500 credit limit', r.status === 200, r.json);
  r = await call('PATCH', `/admin/users/${doc.user_id}/credit`, { token: admin, body: { credit_limit_paise: 50000 } });
  check('doctor accounts cannot get credit', r.status === 400, r.json);
  r = await creditOrder(2);
  const order1 = r.json.data?.order;
  check('net_7 order within limit accepted with due date', r.status === 201 && !!order1?.credit_due_date, r.json);
  let used = (await db.query('SELECT credit_used_paise FROM users WHERE id = $1', [ret.user_id])).rows[0].credit_used_paise;
  check('credit_used = order total', used === order1?.total_paise, { used, total: order1?.total_paise });
  r = await creditOrder(10);
  check('order over remaining limit refused', r.status === 400 && /credit limit/i.test(r.json.message), r.json);
  r = await call('PATCH', `/admin/users/${ret.user_id}/credit`, { token: admin, body: { credit_limit_paise: 100 } });
  check('limit below used credit refused', r.status === 400, r.json);

  console.log('Scheduled jobs');
  await db.query(`UPDATE orders SET credit_due_date = CURRENT_DATE + 3 WHERE id = $1`, [order1.id]);
  r = await call('POST', '/admin/jobs/credit_reminders/run', { token: admin });
  check('credit reminder sent at day -3', r.json.data?.summary?.reminders_sent === 1, r.json);
  r = await call('POST', '/admin/jobs/credit_reminders/run', { token: admin });
  check('re-run does not send it twice', r.json.data?.summary?.reminders_sent === 0, r.json);
  r = await call('GET', '/admin/credit/open', { token: admin });
  check('open credit list shows the order', r.json.data?.orders?.some((o) => o.id === order1.id), r.json);
  r = await call('POST', `/orders/${order1.id}/settle-credit`, { token: admin, body: { payment_reference: 'NEFT-S2-1' } });
  used = (await db.query('SELECT credit_used_paise FROM users WHERE id = $1', [ret.user_id])).rows[0].credit_used_paise;
  check('settling frees the credit', r.status === 200 && used === 0, { r: r.json, used });
  r = await call('POST', `/orders/${order1.id}/settle-credit`, { token: admin, body: { payment_reference: 'NEFT-S2-1' } });
  check('settling twice refused', r.status === 409, r.json);

  await db.query(`UPDATE users SET drug_license_expiry = CURRENT_DATE - 1 WHERE id = $1`, [ret.user_id]);
  r = await call('POST', '/admin/jobs/licence_expiry/run', { token: admin });
  const retStatus = (await db.query('SELECT kyc_status FROM users WHERE id = $1', [ret.user_id])).rows[0].kyc_status;
  check('expired licence → pending_renewal (C-14)', r.json.data?.summary?.blocked >= 1 && retStatus === 'pending_renewal', { r: r.json, retStatus });
  r = await call('GET', '/products/search?q=S2-OTC', { token: retailer });
  check('blocked retailer back to retail price', r.json.data?.products?.find((p) => p.sku === 'S2-OTC')?.display_price_paise === 9000);
  r = await creditOrder(1);
  check('blocked retailer cannot order', r.status === 403, r.json);

  r = await call('POST', '/admin/jobs/gstin_recheck/run', { token: admin });
  check('GSTIN re-check skips cleanly without API keys', r.json.data?.status === 'succeeded', r.json);
  r = await call('POST', '/admin/jobs/low_stock/run', { token: admin });
  check('low-stock job succeeds', r.json.data?.status === 'succeeded', r.json);
  r = await call('GET', '/inventory/low-stock', { token: admin });
  check('low-stock list includes S2-LOW', r.json.data?.products?.some((p) => p.id === low), r.json.data?.counts);
  r = await call('GET', '/admin/jobs', { token: admin });
  check('job list shows the scheduled jobs with recorded runs',
    r.json.data?.jobs?.length >= 4 && r.json.data.jobs.find((j) => j.name === 'low_stock')?.recent_runs?.length >= 1, r.json);
  r = await call('POST', '/admin/jobs/nope/run', { token: admin });
  check('unknown job → 404', r.status === 404, r.json);
  r = await call('POST', '/admin/jobs/low_stock/run', { token: retailer });
  check('buyer cannot run jobs', r.status === 403, r.json);

  console.log('Order clears server cart');
  await db.query(`INSERT INTO addresses (user_id, full_name, mobile, address_line1, city, state, pincode)
                  SELECT id, 'S2', mobile, '1 Lane', 'Nashik', 'Maharashtra', '422001' FROM users WHERE mobile = '9000000105'`);
  const pAddr = (await db.query(`SELECT a.id FROM addresses a JOIN users u ON u.id = a.user_id WHERE u.mobile = '9000000105'`)).rows[0].id;
  await call('PUT', `/cart/items/${otc}`, { token: patientToken, body: { quantity: 1 } });
  r = await call('POST', '/orders', { token: patientToken, body: { address_id: pAddr, pincode: '422001', items: [{ product_id: otc, quantity: 1 }] } });
  const cartAfter = (await call('GET', '/cart', { token: patientToken })).json.data;
  check('ordered line removed from cart, Rx line kept',
    r.status === 201 && !cartAfter.items.some((i) => i.product_id === otc) && cartAfter.items.some((i) => i.product_id === rx), { order: r.json, cartAfter });

  await cleanup();
  await db.end();
  redis.disconnect();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
