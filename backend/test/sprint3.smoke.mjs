// Sprint 3 end-to-end smoke test — marketplace allocation, partner portal,
// settlements, refills and payment-webhook hardening. Run against a local
// API + Postgres + Redis with DISABLE_SCHEDULER=true:
//
//   API_URL=http://localhost:4000 DATABASE_URL=postgresql://... REDIS_URL=redis://... \
//     node test/sprint3.smoke.mjs
//
// Test data: mobiles 90000002xx, SKU prefix S3-, vendors named 'S3 %', pincodes
// 4999xx. Cleaned up before and after. NEVER point it at a production database.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Client } = require('pg');
const Redis = require('ioredis');

const API = (process.env.API_URL || 'http://localhost:4000') + '/api/v1';
const db = new Client({ connectionString: process.env.DATABASE_URL });
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const q = async (sql, params) => (await db.query(sql, params)).rows;

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name}${detail !== undefined ? ' — ' + JSON.stringify(detail).slice(0, 500) : ''}`); }
}

async function call(method, path, { body, token, headers = {} } = {}) {
  const h = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  if (body !== undefined) h['Content-Type'] = 'application/json';
  const res = await fetch(API + path, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

const consent = { accept_privacy_notice: true, age_confirmed: true };
const person = (mobile, name) => ({ customer_type: 'customer', full_name: name, mobile, password: 'Passw0rd!', ...consent });
const people = {
  admin: person('9000000201', 'S3 Admin'),
  buyer: person('9000000202', 'S3 Buyer'),
  partnerA: person('9000000203', 'S3 Partner A login'),
  partnerB: person('9000000204', 'S3 Partner B login'),
};

// Nashik: Dawabag premises 19.9975,73.7898 (default setting). Buyer pincode
// ~1.5 km from premises; partner A sits exactly at the buyer; partner B in Pune.
const BUYER_PIN = '499901', FAR_PIN = '499902', PUNE_PIN = '499903';

async function cleanup() {
  const mobiles = Object.values(people).map((p) => p.mobile);
  const ids = (await q('SELECT id FROM users WHERE mobile = ANY($1)', [mobiles])).map((r) => r.id);
  const vendorIds = (await q(`SELECT id FROM vendors WHERE name LIKE 'S3 %'`)).map((r) => r.id);
  if (ids.length || vendorIds.length) {
    const orderIds = (await q('SELECT id FROM orders WHERE user_id = ANY($1)', [ids])).map((r) => r.id);
    await q('UPDATE refill_subscriptions SET last_order_id = NULL WHERE user_id = ANY($1)', [ids]);
    await q('DELETE FROM refill_items WHERE subscription_id IN (SELECT id FROM refill_subscriptions WHERE user_id = ANY($1))', [ids]);
    await q('UPDATE orders SET refill_subscription_id = NULL WHERE id = ANY($1)', [orderIds]);
    await q('DELETE FROM refill_subscriptions WHERE user_id = ANY($1)', [ids]);
    await q('DELETE FROM payment_mandates WHERE user_id = ANY($1)', [ids]);
    await q('DELETE FROM partner_order_items WHERE order_id = ANY($1) OR partner_id = ANY($2)', [orderIds, vendorIds]);
    await q('DELETE FROM settlement_batches WHERE partner_id = ANY($1)', [vendorIds]);
    await q('DELETE FROM settlement_adjustments WHERE return_id IN (SELECT id FROM return_requests WHERE order_id = ANY($1))', [orderIds]);
    await q('DELETE FROM refunds WHERE order_id = ANY($1)', [orderIds]);
    await q('DELETE FROM credit_notes WHERE order_id = ANY($1)', [orderIds]);
    await q('DELETE FROM return_requests WHERE order_id = ANY($1)', [orderIds]);
    await q('DELETE FROM payments WHERE order_id = ANY($1)', [orderIds]);
    await q('DELETE FROM order_items WHERE order_id = ANY($1)', [orderIds]);
    await q('DELETE FROM order_shipments WHERE order_id = ANY($1)', [orderIds]);
    await q('UPDATE audit_logs SET performed_by = NULL WHERE performed_by = ANY($1)', [ids]);
    await q('UPDATE job_runs SET triggered_by = NULL WHERE triggered_by = ANY($1)', [ids]);
    await q('UPDATE settlement_batches SET created_by = NULL, paid_by = NULL WHERE created_by = ANY($1) OR paid_by = ANY($1)', [ids]);
    await q('UPDATE partner_products SET reviewed_by = NULL, posted_by = NULL, submitted_by = NULL WHERE reviewed_by = ANY($1) OR posted_by = ANY($1) OR submitted_by = ANY($1)', [ids]);
    await q('UPDATE vendor_users SET created_by = NULL WHERE created_by = ANY($1)', [ids]);
    await q('UPDATE partner_commission_rates SET agreed_by_admin = NULL WHERE agreed_by_admin = ANY($1)', [ids]);
    for (const t of ['cart_items', 'carts', 'notifications', 'orders', 'addresses', 'consent_records', 'audit_logs', 'user_profiles']) {
      await q(`DELETE FROM ${t} WHERE user_id = ANY($1)`, [ids]);
    }
    await q('DELETE FROM vendor_users WHERE vendor_id = ANY($1) OR user_id = ANY($2)', [vendorIds, ids]);
    await q('DELETE FROM partner_inventory WHERE partner_id = ANY($1)', [vendorIds]);
    await q('DELETE FROM partner_products WHERE partner_id = ANY($1)', [vendorIds]);
    await q('DELETE FROM partner_commission_rates WHERE partner_id = ANY($1)', [vendorIds]);
    await q('UPDATE vendors SET approved_by = NULL WHERE id = ANY($1)', [vendorIds]);
    await q('DELETE FROM users WHERE id = ANY($1)', [ids]);
    await q('DELETE FROM vendors WHERE id = ANY($1)', [vendorIds]);
  }
  await q(`DELETE FROM invoice_series WHERE series_key LIKE 'P:%' AND prefix IN ('S3A','S3B')`);
  await q(`DELETE FROM low_stock_alerts WHERE product_id IN (SELECT id FROM products WHERE sku LIKE 'S3-%')`);
  await q(`DELETE FROM inventory_batches WHERE product_id IN (SELECT id FROM products WHERE sku LIKE 'S3-%')`);
  await q(`DELETE FROM products WHERE sku LIKE 'S3-%'`);
  await q(`DELETE FROM pincode_serviceability WHERE pincode IN ($1, $2, $3)`, [BUYER_PIN, FAR_PIN, PUNE_PIN]);
}

async function signUp(p) {
  await call('POST', '/auth/register', { body: p });
  const otp = await redis.get(`otp:${p.mobile}`);
  return (await call('POST', '/auth/verify-otp', { body: { mobile: p.mobile, otp } })).json.data;
}
const login = async (p) => (await call('POST', '/auth/login', { body: { mobile: p.mobile, password: p.password } })).json.data?.access_token;

async function main() {
  await db.connect();
  // Test clean-up may delete final records (H1, credit notes, audit); the API never sets this
  await db.query("SET dawabag.maintenance = 'on'");
  await cleanup();

  // Geography
  await q(`INSERT INTO pincode_serviceability (pincode, city, state, latitude, longitude, dawabag_delivery_hours, cold_chain_available)
           VALUES ($1, 'Nashik', 'MH', 20.0110, 73.7900, 12, FALSE),
                  ($2, 'Nashik rural', 'MH', 20.3000, 74.2000, NULL, FALSE),
                  ($3, 'Pune', 'MH', 18.5204, 73.8567, NULL, FALSE)`, [BUYER_PIN, FAR_PIN, PUNE_PIN]);

  // Products: P1 both Dawabag + partners; P2 partner B only; P3 Dawabag only;
  // P4 cold chain partner only; P5 Schedule H1; PX Schedule X
  const product = async (sku, schedule = 'OTC', cold = false) => (await q(
    `INSERT INTO products (name, sku, category, drug_schedule, cold_chain, mrp_paise, offer_price_paise,
       ptr_price_paise, pts_price_paise, institutional_price_paise, max_qty_per_order, gst_rate)
     VALUES ($1, $1, 'Smoke', $2, $3, 10000, 9000, 7500, 7000, 8200, 500, 12) RETURNING id`, [sku, schedule, cold]))[0].id;
  const P1 = await product('S3-P1'), P2 = await product('S3-P2'), P3 = await product('S3-P3');
  const P4 = await product('S3-P4', 'OTC', true), P5 = await product('S3-P5', 'Schedule H1'), PX = await product('S3-PX', 'Schedule X');
  for (const [p, qty] of [[P1, 500], [P3, 100]]) {
    await q(`INSERT INTO inventory_batches (product_id, batch_number, quantity_available, purchase_price_paise, expiry_date)
             VALUES ($1, 'DWB-1', $2, 5000, CURRENT_DATE + 400)`, [p, qty]);
  }

  // Users
  const adminU = await signUp(people.admin);
  await q(`UPDATE users SET role = 'super_admin' WHERE id = $1`, [adminU.user_id]);
  const admin = await login(people.admin);
  const buyerU = await signUp(people.buyer);
  const buyer = await login(people.buyer);
  await signUp(people.partnerA); await signUp(people.partnerB);

  console.log('Partner onboarding');
  const vendor = async (name, pin, lat, lng) => (await q(
    `INSERT INTO vendors (name, drug_license_no, gst_number, pincode, latitude, longitude, vendor_type, approval_status)
     VALUES ($1, $2, '27ABCDE1234F1Z5', $3, $4, $5, 'marketplace_partner', 'pending') RETURNING id`,
    [name, `DL-${name}`, pin, lat, lng]))[0].id;
  const VA = await vendor('S3 Partner A', BUYER_PIN, 20.0110, 73.7900);
  const VB = await vendor('S3 Partner B', PUNE_PIN, 18.5204, 73.8567);
  let r = await call('POST', `/vendors/${VA}/approve`, { token: admin, body: {
    drug_license_type: 'dl20b', drug_license_expiry: '2029-12-31', vendor_type: 'marketplace_partner' } });
  check('partner approval without invoice prefix refused', r.status === 400, r.json);
  for (const [v, prefix] of [[VA, 'S3A'], [VB, 'S3B']]) {
    r = await call('POST', `/vendors/${v}/approve`, { token: admin, body: {
      drug_license_type: 'dl20b', drug_license_expiry: '2029-12-31', vendor_type: 'marketplace_partner', invoice_prefix: prefix } });
  }
  check('partners approved with invoice prefixes', r.status === 200, r.json);
  r = await call('POST', `/admin/partners/${VA}/users`, { token: admin, body: { mobile: people.partnerA.mobile } });
  check('admin links partner login', r.status === 200, r.json);
  await call('POST', `/admin/partners/${VB}/users`, { token: admin, body: { mobile: people.partnerB.mobile } });
  r = await call('PUT', `/admin/partners/${VA}/commission`, { token: admin, body: { commission_pct: 10, finding_fee_paise: 2000 } });
  check('admin sets partner A commission', r.status === 200, r.json);
  const pa = await login(people.partnerA);
  const pb = await login(people.partnerB);
  r = await call('GET', '/partner/me', { token: pa });
  check('partner portal /me', r.json.data?.name === 'S3 Partner A' && r.json.data?.invoice_prefix === 'S3A', r.json);
  r = await call('GET', '/partner/me', { token: buyer });
  check('buyer cannot use partner portal', r.status === 403, r.json);

  console.log('Listings');
  r = await call('GET', '/partner/catalogue?q=S3-P', { token: pa });
  check('catalogue search hides Schedule X', r.json.data?.products?.length >= 5 && !r.json.data.products.some((p) => p.sku === 'S3-PX'), r.json);
  r = await call('POST', '/partner/products', { token: pa, body: { product_id: P1 } });
  check('listing requires accepting catalogue price', r.status === 422, r.json);
  r = await call('POST', '/partner/products', { token: pa, body: { product_id: PX, catalogue_price_accepted: true } });
  check('Schedule X listing refused', r.status === 403, r.json);
  r = await call('POST', '/partner/products', { token: pa, body: { product_id: P5, catalogue_price_accepted: true } });
  check('Schedule H1 listing without pharmacist/storage declaration refused (task 22)', r.status === 400, r.json);
  r = await call('POST', '/partner/products', { token: pa, body: { product_id: P5, catalogue_price_accepted: true,
    h1_pharmacist_name: 'Ravi Patil', h1_pharmacist_reg_no: 'MSPC-12345', h1_secure_storage_declared: true } });
  check('Schedule H1 listing with declarations accepted', r.status === 201, r.json);

  const list = async (token, productId) => (await call('POST', '/partner/products', { token, body: { product_id: productId, catalogue_price_accepted: true } })).json.data?.id;
  const A1 = await list(pa, P1), A4 = await list(pa, P4), B1 = await list(pb, P1), B2 = await list(pb, P2), B4 = await list(pb, P4);
  r = await call('POST', '/partner/products', { token: pa, body: { product_id: P1, catalogue_price_accepted: true } });
  check('duplicate listing refused', r.status === 409, r.json);

  const inv = (token, id, batches) => call('PUT', `/partner/products/${id}/inventory`, { token, body: { batches } });
  r = await inv(pa, A4, [{ batch_number: 'A4-1', qty_available: 50, expiry_date: '2028-01-31' }]);
  check('cold-chain stock needs cold storage confirmation', r.status === 400, r.json);
  await inv(pa, A1, [{ batch_number: 'A1-1', qty_available: 200, expiry_date: '2028-01-31' }]);
  await inv(pb, B1, [{ batch_number: 'B1-1', qty_available: 200, expiry_date: '2027-12-31' }]);
  await inv(pb, B2, [{ batch_number: 'B2-1', qty_available: 200, expiry_date: '2027-12-31' }]);
  r = await inv(pb, B4, [{ batch_number: 'B4-1', qty_available: 50, expiry_date: '2027-12-31', cold_chain_confirmed: true }]);
  check('partner stock recorded', r.status === 200 && r.json.data?.batches?.[0]?.qty_available === 50, r.json);

  r = await call('GET', '/vendors/partner-products/pending', { token: admin });
  const queued = r.json.data?.products?.filter((p) => [VA, VB].includes(p.partner_id)).length;
  check('review queue lists partner submissions', queued >= 5, r.json.data?.products?.length);
  for (const id of [A1, B1, B2, B4]) {
    await call('POST', `/vendors/partner-products/${id}/approve`, { token: admin });
    await call('POST', `/vendors/partner-products/${id}/post-live`, { token: admin });
  }
  r = await call('POST', `/vendors/partner-products/${A4}/reject`, { token: admin, body: { rejection_reason_code: 'REJ-03', rejection_details: 'No cold storage evidence' } });
  check('admin rejects a listing with a reason code', r.status === 200, r.json);
  const live = await q(`SELECT COUNT(*)::int AS n FROM partner_products WHERE id = ANY($1) AND listing_status = 'live'`, [[A1, B1, B2, B4]]);
  check('approved listings are live', live[0].n === 4, live);

  console.log('Allocation');
  const addr = (await q(`INSERT INTO addresses (user_id, full_name, mobile, address_line1, city, state, pincode)
                         VALUES ($1, 'S3 Buyer', $2, '1 Lane', 'Nashik', 'MH', $3) RETURNING id`,
    [buyerU.user_id, people.buyer.mobile, BUYER_PIN]))[0].id;
  const order = (items) => call('POST', '/orders', { token: buyer, body: { address_id: addr, pincode: BUYER_PIN, items } });
  const shipmentsOf = async (orderId) => q(
    `SELECT s.seller_type, v.name AS partner, s.invoice_number, s.total_paise,
            (SELECT array_agg(p.sku ORDER BY p.sku) FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.shipment_id = s.id) AS skus
     FROM order_shipments s LEFT JOIN vendors v ON v.id = s.partner_id WHERE s.order_id = $1 ORDER BY s.seller_type, v.name`, [orderId]);

  r = await order([{ product_id: P1, quantity: 2 }]);
  let sh = r.json.data?.order ? await shipmentsOf(r.json.data.order.id) : [];
  check('small order → nearest seller (partner A at the buyer, not Dawabag 1.5 km away)',
    sh.length === 1 && sh[0].partner === 'S3 Partner A', { r: r.json, sh });
  check('partner invoice uses the partner series', /^S3A\/\d{4}-\d{2}\/\d{6}$/.test(sh[0]?.invoice_number || ''), sh);
  check('order invoice_number empty when Dawabag ships nothing', r.json.data?.order?.invoice_number === null, r.json.data?.order);
  const smallOrderId = r.json.data?.order?.id;

  r = await order([{ product_id: P1, quantity: 120 }]);   // 120 × ₹90 + GST > ₹10,000
  sh = r.json.data?.order ? await shipmentsOf(r.json.data.order.id) : [];
  check('order > ₹10,000 and Dawabag within 24 h → Dawabag stock first',
    sh.length === 1 && sh[0].seller_type === 'dawabag' && /^DWB\//.test(sh[0].invoice_number), { r: r.json, sh });

  r = await order([{ product_id: P3, quantity: 1 }, { product_id: P2, quantity: 1 }]);
  sh = r.json.data?.order ? await shipmentsOf(r.json.data.order.id) : [];
  check('mixed order splits into Dawabag + partner B shipments with separate invoices',
    sh.length === 2 && sh[0].seller_type === 'dawabag' && sh[1].partner === 'S3 Partner B'
      && sh[0].invoice_number !== sh[1].invoice_number, sh);
  check('order total = sum of shipments (before shipping/discount)',
    r.json.data?.order?.shipments?.reduce((s, x) => s + x.total_paise, 0) === sh.reduce((s, x) => s + x.total_paise, 0), r.json.data?.order);

  r = await order([{ product_id: P4, quantity: 1 }]);
  sh = r.json.data?.order ? await shipmentsOf(r.json.data.order.id) : [];
  check('cold-chain line goes only to a partner with confirmed cold storage (B, not A/Dawabag)',
    sh.length === 1 && sh[0].partner === 'S3 Partner B', { r: r.json, sh });

  const dwbNumbers = (await q(`SELECT invoice_number FROM order_shipments WHERE invoice_number LIKE 'DWB/%' ORDER BY invoice_number DESC LIMIT 2`)).map((x) => Number(x.invoice_number.slice(-6)));
  check('Dawabag invoice numbers are consecutive', dwbNumbers.length < 2 || dwbNumbers[0] - dwbNumbers[1] === 1, dwbNumbers);

  console.log('Cancellation releases reservations');
  const reservedBefore = (await q(`SELECT qty_reserved FROM partner_inventory WHERE partner_product_id = $1`, [A1]))[0].qty_reserved;
  r = await call('PATCH', `/orders/${smallOrderId}/status`, { token: admin, body: { status: 'cancelled' } });
  const reservedAfter = (await q(`SELECT qty_reserved FROM partner_inventory WHERE partner_product_id = $1`, [A1]))[0].qty_reserved;
  check('cancelling frees partner reserved stock', r.status === 200 && reservedAfter === reservedBefore - 2, { reservedBefore, reservedAfter, r: r.json });

  console.log('Partner fulfilment + settlement');
  r = await order([{ product_id: P1, quantity: 3 }]);
  const o2 = r.json.data?.order;
  const shipA = (await q(`SELECT id FROM order_shipments WHERE order_id = $1`, [o2.id]))[0].id;
  r = await call('GET', '/partner/shipments', { token: pa });
  check('unpaid order is not yet in the partner queue', !r.json.data?.shipments?.some((s) => s.id === shipA), r.json.data?.shipments?.length);
  await q(`UPDATE orders SET status = 'packing' WHERE id = $1`, [o2.id]);   // as after payment capture
  r = await call('GET', '/partner/shipments?status=pending', { token: pa });
  const queuedShip = r.json.data?.shipments?.find((s) => s.id === shipA);
  check('paid order appears with ship-to address and batch', queuedShip?.pincode === BUYER_PIN && queuedShip?.lines?.[0]?.batch_number === 'A1-1', queuedShip);
  r = await call('POST', `/partner/shipments/${shipA}/dispatch`, { token: pb, body: { courier_partner: 'Delhivery', awb_number: 'AWB123456', seal_number: 'SEAL-S3-1' } });
  check('another partner cannot dispatch it', r.status === 404, r.json);
  const stockBefore = (await q(`SELECT qty_available, qty_reserved FROM partner_inventory WHERE partner_product_id = $1`, [A1]))[0];
  r = await call('POST', `/partner/shipments/${shipA}/dispatch`, { token: pa, body: { courier_partner: 'Delhivery', awb_number: 'AWB123456', seal_number: 'SEAL-S3-1' } });
  const stockAfter = (await q(`SELECT qty_available, qty_reserved FROM partner_inventory WHERE partner_product_id = $1`, [A1]))[0];
  check('dispatch consumes reserved stock', r.status === 200 && stockAfter.qty_available === stockBefore.qty_available - 3
    && stockAfter.qty_reserved === stockBefore.qty_reserved - 3, { stockBefore, stockAfter, r: r.json });
  r = await call('POST', `/partner/shipments/${shipA}/delivered`, { token: pa });
  const o2status = (await q(`SELECT status FROM orders WHERE id = $1`, [o2.id]))[0].status;
  check('delivered shipment completes the single-shipment order', r.status === 200 && o2status === 'delivered', { r: r.json, o2status });

  const today = new Date().toISOString().slice(0, 10);
  r = await call('POST', '/admin/settlements/generate', { token: admin, body: { period_from: today, period_to: today } });
  const batchA = r.json.data?.batches?.find(Boolean);
  const detail = batchA ? (await call('GET', `/admin/settlements/${batchA.id}`, { token: admin })).json.data : null;
  // 3 × ₹90 = ₹270 taxable, GST 12% = ₹32.40; commission 10% = ₹27; fee ₹20; GST 18% on ₹47 = ₹8.46;
  // TCS 0.5% = ₹1.35; TDS 0.1% = ₹0.27 → net = 30240 − 2700 − 2000 − 846 − 135 − 27 = 24532 paise
  check('settlement: commission, fee, GST on fees, TCS, TDS and net payable',
    detail && Number(detail.taxable_value_paise) === 27000 && Number(detail.commission_paise) === 2700
      && Number(detail.finding_fee_paise) === 2000 && Number(detail.fee_gst_paise) === 846
      && Number(detail.tcs_paise) === 135 && Number(detail.tds_paise) === 27 && Number(detail.net_payable_paise) === 24532,
    detail && { taxable: detail.taxable_value_paise, comm: detail.commission_paise, fee: detail.finding_fee_paise,
      feeGst: detail.fee_gst_paise, tcs: detail.tcs_paise, tds: detail.tds_paise, net: detail.net_payable_paise });
  check('commission invoice from the DWS series', /^DWS\//.test(detail?.commission_invoice_no || ''), detail?.commission_invoice_no);
  r = await call('POST', '/admin/settlements/generate', { token: admin, body: { period_from: today, period_to: today } });
  check('re-running does not settle the same lines twice', r.status === 200 && !r.json.data?.batches?.length, r.json);
  r = await call('GET', '/partner/settlements', { token: pa });
  check('partner sees its own settlement only', r.json.data?.settlements?.length === 1 && r.json.data.settlements[0].partner_id === VA, r.json);
  r = await call('POST', `/admin/settlements/${batchA?.id}/pay`, { token: admin, body: { payment_mode: 'NEFT', utr_reference: 'UTR0001234' } });
  check('admin records payout', r.json.data?.payment_status === 'paid', r.json);

  console.log('Refills');
  r = await call('POST', '/refills', { token: buyer, body: { order_id: o2.id, frequency_days: 30 } });
  const subId = r.json.data?.id;
  check('buyer subscribes to a refill of a delivered order', r.status === 201, r.json);
  await q(`UPDATE refill_subscriptions SET next_refill_date = CURRENT_DATE + 3 WHERE id = $1`, [subId]);
  r = await call('POST', '/admin/jobs/refill_reminders/run', { token: admin });
  check('reminder (pre-debit notice) sent 3 days before', r.json.data?.summary?.reminders_sent === 1, r.json);
  r = await call('POST', '/admin/jobs/refill_reminders/run', { token: admin });
  check('reminder not repeated', r.json.data?.summary?.reminders_sent === 0, r.json);
  await q(`UPDATE refill_subscriptions SET next_refill_date = CURRENT_DATE WHERE id = $1`, [subId]);
  r = await call('POST', '/admin/jobs/refill_orders/run', { token: admin });
  const refillOrder = (await q(`SELECT id, status, refill_for_date FROM orders WHERE refill_subscription_id = $1`, [subId]))[0];
  const sub = (await q(`SELECT next_refill_date - CURRENT_DATE AS days FROM refill_subscriptions WHERE id = $1`, [subId]))[0];
  check('refill order placed (awaiting payment, no mandate) and next date moved 30 days',
    r.json.data?.summary?.ordered === 1 && refillOrder?.status === 'pending_payment' && sub.days === 30, { r: r.json, refillOrder, sub });
  r = await call('POST', '/admin/jobs/refill_orders/run', { token: admin });
  const count = (await q(`SELECT COUNT(*)::int AS n FROM orders WHERE refill_subscription_id = $1`, [subId]))[0].n;
  check('re-running does not order twice', count === 1, { count, r: r.json });
  r = await call('GET', '/refills', { token: buyer });
  check('refill list shows items and next date', r.json.data?.refills?.[0]?.items?.[0]?.quantity === 3, r.json);
  r = await call('POST', '/refills/mandates', { token: buyer, body: { max_amount_paise: 500000, method: 'upi' } });
  check('mandate setup needs Razorpay keys (503 here)', r.status === 503, r.json);

  console.log('Payment hardening');
  r = await call('POST', '/payments/webhook', { body: { event: 'payment.captured', payload: { payment: { entity: { order_id: 'x' } } } } });
  check('unsigned webhook rejected', r.status === 400, r.json);

  console.log('Settings');
  r = await call('PUT', '/admin/settings/allocation.own_first_min_order_paise', { token: admin, body: { value: -5 } });
  check('invalid setting refused', r.status === 422, r.json);
  r = await call('GET', '/admin/settings', { token: admin });
  check('settings list', r.json.data?.settings?.some((s) => s.key === 'marketplace.tcs_pct'), r.json);

  await cleanup();
  await db.end();
  redis.disconnect();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
