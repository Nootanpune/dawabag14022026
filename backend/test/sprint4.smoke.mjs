// Sprint 4 end-to-end smoke test — pharmacist prescription gate, H1 register,
// Dawabag fulfilment, invoice PDF, price rules, grievances, batch recall,
// privacy rights and legal settings. Run against a local API + Postgres +
// Redis with DISABLE_SCHEDULER=true:
//
//   API_URL=http://localhost:4000 DATABASE_URL=postgresql://... REDIS_URL=redis://... \
//     node test/sprint4.smoke.mjs
//
// Test data: mobiles 90000004xx, SKU prefix S4-, pincode 499941. Cleaned up
// before and after. NEVER point it at a production database.
import { createRequire } from 'module';
import { cleanup, people, PIN } from './sprint4.fixtures.mjs';
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

async function call(method, path, { body, token, raw = false } = {}) {
  const h = {};
  if (token) h.Authorization = `Bearer ${token}`;
  if (body !== undefined) h['Content-Type'] = 'application/json';
  const res = await fetch(API + path, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
  if (raw) return { status: res.status, type: res.headers.get('content-type'), buf: Buffer.from(await res.arrayBuffer()) };
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function signUp(p) {
  await call('POST', '/auth/register', { body: p });
  const otp = await redis.get(`otp:${p.mobile}`);
  return (await call('POST', '/auth/verify-otp', { body: { mobile: p.mobile, otp } })).json.data;
}
const login = async (p) => (await call('POST', '/auth/login', { body: { mobile: p.mobile, password: p.password } })).json.data?.access_token;

async function main() {
  await db.connect();
  await cleanup(q);
  await q(`INSERT INTO pincode_serviceability (pincode, city, state, latitude, longitude, dawabag_delivery_hours, cold_chain_available)
           VALUES ($1, 'Nashik', 'Maharashtra', 20.0110, 73.7900, 12, FALSE)`, [PIN]);

  const ids = {};
  for (const [k, p] of Object.entries(people)) ids[k] = (await signUp(p)).user_id;
  await q(`UPDATE users SET role = 'super_admin' WHERE id = $1`, [ids.admin]);
  await q(`UPDATE users SET role = 'pharmacist_rx' WHERE id = $1`, [ids.pharmacist]);
  await q(`UPDATE users SET role = 'pharmacist_pack' WHERE id = $1`, [ids.packer]);
  const t = {};
  for (const [k, p] of Object.entries(people)) t[k] = await login(p);

  console.log('Price rules (C-16)');
  const base = { name: 'S4 Test', category: 'Smoke', drug_schedule: 'OTC', gst_rate: 12, hsn_code: '3004',
    net_quantity: '10 tablets', manufacturer_name: 'S4 Pharma Ltd', manufacturer_address: 'Plot 1, MIDC, Nashik 422010' };
  let r = await call('POST', '/products', { token: t.admin, body: { ...base, sku: 'S4-BAD1', mrp_paise: 10000, offer_price_paise: 10500 } });
  check('offer price above MRP refused', r.status === 400, r.json);
  r = await call('POST', '/products', { token: t.admin, body: { ...base, sku: 'S4-BAD2', mrp_paise: 10000, offer_price_paise: 9000, nppa_ceiling_price_paise: 9500 } });
  check('MRP above NPPA ceiling refused', r.status === 400, r.json);
  const mk = async (sku, schedule) => (await call('POST', '/products', { token: t.admin, body: {
    ...base, name: `S4 ${sku}`, sku, drug_schedule: schedule, mrp_paise: 10000, offer_price_paise: 9000,
    ptr_price_paise: 7500, max_qty_per_order: 50 } })).json.data?.id;
  const H1 = await mk('S4-H1', 'Schedule H1'), OTC = await mk('S4-OTC', 'OTC'), RC = await mk('S4-RC', 'OTC');
  check('valid products created', !!(H1 && OTC && RC));
  r = await call('PATCH', `/products/${OTC}`, { token: t.admin, body: { ptr_price_paise: 12000 } });
  check('update raising PTR above MRP refused', r.status === 400, r.json);
  r = await call('PATCH', `/products/${OTC}`, { token: t.admin, body: { unknown_field: 1 } });
  check('update with unknown field refused', r.status === 422, r.json);
  let dbErr = null;
  try { await q(`UPDATE products SET offer_price_paise = mrp_paise + 1 WHERE id = $1`, [OTC]); } catch (e) { dbErr = e.code; }
  check('database CHECK also blocks price > MRP', dbErr === '23514', dbErr);

  for (const [p, batch] of [[H1, 'H1-B1'], [OTC, 'OTC-B1'], [RC, 'RC-1']]) {
    await q(`INSERT INTO inventory_batches (product_id, batch_number, quantity_available, purchase_price_paise, expiry_date)
             VALUES ($1, $2, 100, 5000, CURRENT_DATE + 400)`, [p, batch]);
  }
  const address = async (uid, name) => (await q(`INSERT INTO addresses (user_id, full_name, mobile, address_line1, city, state, pincode)
     VALUES ($1, $2, '9000000499', '1 Lane', 'Nashik', 'Maharashtra', $3) RETURNING id`, [uid, name, PIN]))[0].id;
  const addr = await address(ids.buyer, 'S4 Buyer');
  const order = async (items, token = t.buyer, a = addr) => {
    const res = await call('POST', '/orders', { token, body: { address_id: a, pincode: PIN, items } });
    return res.json.data?.order;
  };
  const rxRow = async (uid, orderId) => (await q(
    `INSERT INTO prescriptions (user_id, order_id, s3_key, file_type) VALUES ($1, $2, 'test/s4.jpg', 'jpg') RETURNING id`, [uid, orderId]))[0].id;
  const shipmentOf = async (orderId) => (await q(`SELECT id FROM order_shipments WHERE order_id = $1`, [orderId]))[0]?.id;

  console.log('Prescription gate (C-08)');
  const o1 = await order([{ product_id: H1, quantity: 2 }, { product_id: OTC, quantity: 1 }]);
  check('order with Schedule H1 line placed', !!o1?.id, o1);
  await q(`UPDATE orders SET status = 'rx_pending' WHERE id = $1`, [o1.id]);   // as after payment capture
  const rx1 = await rxRow(ids.buyer, o1.id);
  const s1 = await shipmentOf(o1.id);
  r = await call('POST', `/fulfilment/shipments/${s1}/pack`, { token: t.packer });
  check('cannot pack while prescription pending', r.status === 409, r.json);
  r = await call('GET', '/fulfilment/queue?stage=rx', { token: t.pharmacist });
  check('pharmacist Rx queue lists the order', r.json.data?.items?.some((i) => i.order_id === o1.id), r.json);
  r = await call('GET', '/fulfilment/queue?stage=rx', { token: t.packer });
  check('packer cannot see the Rx queue', r.status === 403, r.json);

  const verifyBody = (qty, product = H1) => ({ prescriber_name: 'Dr. Asha Kulkarni', prescriber_reg_no: 'MMC-2011-4455',
    prescribed_on: new Date(Date.now() - 5 * 864e5).toISOString().slice(0, 10), patient_name: 'S4 Buyer',
    valid_days: 90, items: [{ product_id: product, prescribed_qty: qty }] });
  r = await call('POST', `/fulfilment/prescriptions/${rx1}/verify`, { token: t.pharmacist, body: verifyBody(6) });
  check('pharmacist without council registration cannot verify', r.status === 403, r.json);
  r = await call('PATCH', `/admin/users/${ids.pharmacist}/pharmacist`, { token: t.admin, body: { pharmacist_reg_no: 'MSPC-S4-001' } });
  check('admin records pharmacist registration', r.status === 200, r.json);
  r = await call('POST', `/fulfilment/prescriptions/${rx1}/verify`, { token: t.pharmacist, body: verifyBody(6, OTC) });
  check('prescription not covering the H1 product refused', r.status === 400, r.json);
  r = await call('POST', `/fulfilment/prescriptions/${rx1}/verify`, { token: t.pharmacist, body: verifyBody(1) });
  check('order quantity above prescribed quantity refused', r.status === 400, r.json);
  r = await call('POST', `/fulfilment/prescriptions/${rx1}/verify`, { token: t.pharmacist,
    body: { ...verifyBody(6), prescribed_on: new Date(Date.now() - 200 * 864e5).toISOString().slice(0, 10) } });
  check('prescription older than 180 days refused', r.status === 400, r.json);
  r = await call('POST', `/fulfilment/prescriptions/${rx1}/verify`, { token: t.pharmacist, body: verifyBody(6) });
  const o1s = (await q(`SELECT status FROM orders WHERE id = $1`, [o1.id]))[0].status;
  check('valid prescription verified; order moves to rx_verified', r.status === 200 && o1s === 'rx_verified', { r: r.json, o1s });
  const disp = (await q(`SELECT dispensed_qty FROM prescription_items WHERE prescription_id = $1`, [rx1]))[0];
  check('dispensed quantity recorded against prescription', disp?.dispensed_qty === 2, disp);

  console.log('Pack, dispatch, H1 register (C-09)');
  r = await call('GET', '/fulfilment/queue?stage=pack', { token: t.packer });
  check('pack queue shows the shipment with batch', r.json.data?.items?.find((i) => i.shipment_id === s1)?.lines?.some((l) => l.batch_number === 'H1-B1'), r.json);
  r = await call('POST', `/fulfilment/shipments/${s1}/dispatch`, { token: t.packer, body: { courier_partner: 'Delhivery', awb_number: 'S4AWB1', seal_number: 'SEAL-S4-1' } });
  check('dispatch before packing refused', r.status === 409, r.json);
  r = await call('POST', `/fulfilment/shipments/${s1}/pack`, { token: t.packer });
  check('packer packs the shipment', r.status === 200, r.json);
  const before = (await q(`SELECT quantity_available, quantity_reserved FROM inventory_batches WHERE batch_number = 'H1-B1'`))[0];
  r = await call('POST', `/fulfilment/shipments/${s1}/dispatch`, { token: t.packer, body: { courier_partner: 'Delhivery', awb_number: 'S4AWB1', seal_number: 'SEAL-S4-1' } });
  const after = (await q(`SELECT quantity_available, quantity_reserved FROM inventory_batches WHERE batch_number = 'H1-B1'`))[0];
  check('dispatch writes one H1 register row', r.status === 200 && r.json.data?.h1_register_rows === 1, r.json);
  check('dispatch deducts the reserved stock', after.quantity_available === before.quantity_available - 2
    && after.quantity_reserved === before.quantity_reserved - 2, { before, after });
  const h1 = (await q(`SELECT * FROM h1_register WHERE order_id = $1`, [o1.id]))[0];
  check('H1 row has patient, prescriber, batch and pharmacist', h1?.patient_name === 'S4 Buyer' && h1?.prescriber_reg_no === 'MMC-2011-4455'
    && h1?.batch_number === 'H1-B1' && h1?.pharmacist_reg_no === 'MSPC-S4-001', h1);
  const today = new Date().toISOString().slice(0, 10);
  r = await call('GET', `/fulfilment/h1-register?from=${today}&to=${today}&format=csv`, { token: t.pharmacist, raw: true });
  check('H1 register CSV export', r.status === 200 && /csv/.test(r.type) && r.buf.toString().includes('S4 S4-H1'), { status: r.status, type: r.type });
  r = await call('GET', `/fulfilment/h1-register?from=${today}&to=${today}`, { token: t.buyer });
  check('buyer cannot read the H1 register', r.status === 403, r.json);
  // Prescription shipment: handed over only against the buyer's code (C-26)
  r = await call('POST', `/fulfilment/shipments/${s1}/delivered`, { token: t.admin, body: { code: '000000' } });
  check('delivery without naming the receiver refused', r.status === 400, r.json);
  const code = (await call('GET', `/orders/${o1.id}`, { token: t.buyer })).json.data?.shipments?.[0]?.handover_code;
  const staffView = (await call('GET', `/orders/${o1.id}`, { token: t.admin })).json.data?.shipments?.[0]?.handover_code;
  check('buyer sees the delivery code; staff do not', /^\d{6}$/.test(code || '') && staffView === null, { code, staffView });
  const handover = { received_by_name: 'S4 Buyer', received_by_relation: 'self' };
  r = await call('POST', `/fulfilment/shipments/${s1}/delivered`, { token: t.admin, body: { ...handover, code: code === '000000' ? '111111' : '000000' } });
  check('wrong delivery code refused', r.status === 400 && /code/i.test(r.json.message), r.json);
  r = await call('POST', `/fulfilment/shipments/${s1}/delivered`, { token: t.admin, body: { ...handover, code } });
  const o1d = (await q(`SELECT status FROM orders WHERE id = $1`, [o1.id]))[0].status;
  check('delivery completes the order', r.status === 200 && o1d === 'delivered', { r: r.json, o1d });

  console.log('Invoice PDF');
  r = await call('GET', `/invoices/shipments/${s1}.pdf`, { token: t.buyer, raw: true });
  check('buyer downloads the tax invoice PDF', r.status === 200 && r.type === 'application/pdf' && r.buf.subarray(0, 4).toString() === '%PDF', { status: r.status, type: r.type });
  r = await call('GET', `/invoices/shipments/${s1}.pdf`, { token: t.buyer2, raw: true });
  check('another buyer cannot download it', r.status === 404 || r.status === 403, r.status);

  console.log('Prescription reuse');
  const o2 = await order([{ product_id: H1, quantity: 3 }]);
  await q(`UPDATE orders SET status = 'rx_pending' WHERE id = $1`, [o2.id]);
  r = await call('POST', `/fulfilment/prescriptions/${rx1}/apply`, { token: t.pharmacist, body: { order_id: o2.id } });
  check('verified prescription reused for a refill order', r.status === 200 && r.json.data?.lines_covered === 1, r.json);
  const o3 = await order([{ product_id: H1, quantity: 2 }]);
  await q(`UPDATE orders SET status = 'rx_pending' WHERE id = $1`, [o3.id]);
  r = await call('POST', `/fulfilment/prescriptions/${rx1}/apply`, { token: t.pharmacist, body: { order_id: o3.id } });
  check('reuse beyond the prescribed quantity refused (1 left, 2 ordered)', r.status === 400, r.json);
  const addr2 = await address(ids.buyer2, 'S4 Buyer Two');
  const o4 = await order([{ product_id: H1, quantity: 1 }], t.buyer2, addr2);
  await q(`UPDATE orders SET status = 'rx_pending' WHERE id = $1`, [o4.id]);
  r = await call('POST', `/fulfilment/prescriptions/${rx1}/apply`, { token: t.pharmacist, body: { order_id: o4.id } });
  check("another buyer's order cannot use the prescription", r.status === 400, r.json);
  await q(`UPDATE orders SET status = 'cancelled' WHERE id = ANY($1)`, [[o3.id, o4.id]]);

  console.log('Grievances (C-36)');
  r = await call('POST', '/grievances', { token: t.buyer, body: { category: 'delivery', subject: 'Late delivery', description: 'My order arrived two days late.', order_id: o1.id } });
  const g1 = r.json.data;
  check('buyer files a complaint with a ticket number', r.status === 201 && /^GRV-\d{4}-\d{6}$/.test(g1?.ticket_no || ''), r.json);
  r = await call('POST', '/grievances', { token: t.buyer2, body: { category: 'order', subject: 'Other order', description: 'Trying another buyer order id', order_id: o1.id } });
  check("complaint on someone else's order refused", r.status === 404, r.json);
  r = await call('GET', `/grievances/${g1.id}`, { token: t.buyer2 });
  check("buyer cannot read another buyer's complaint", r.status === 404, r.json);
  r = await call('POST', `/grievances/${g1.id}/messages`, { token: t.admin, body: { body: 'Sorry — we are checking with the courier.' } });
  check('first staff reply acknowledges', r.status === 201 && r.json.data?.status === 'acknowledged' && r.json.data?.messages?.[0]?.author === 'Dawabag support', r.json);
  r = await call('PATCH', `/grievances/${g1.id}/status`, { token: t.admin, body: { status: 'resolved' } });
  check('resolving needs a resolution', r.status === 400, r.json);
  r = await call('PATCH', `/grievances/${g1.id}/status`, { token: t.admin, body: { status: 'resolved', resolution: 'Shipping fee refunded.' } });
  check('staff resolves the complaint', r.status === 200, r.json);
  r = await call('POST', `/grievances/${g1.id}/messages`, { token: t.buyer, body: { body: 'Refund not received yet.' } });
  check('buyer reply reopens a resolved complaint', r.json.data?.status === 'in_progress', r.json.data?.status);
  r = await call('POST', '/grievances', { token: t.buyer, body: { category: 'pricing', subject: 'Price query', description: 'Price seemed higher than MRP.' } });
  await q(`UPDATE grievances SET created_at = NOW() - INTERVAL '3 days' WHERE id = $1`, [r.json.data.id]);
  r = await call('GET', '/grievances/admin/all?overdue=true', { token: t.admin });
  check('unacknowledged complaint after 48 h shows as overdue', r.json.data?.grievances?.some((g) => g.subject === 'Price query' && g.ack_overdue), r.json);
  r = await call('GET', '/grievances/admin/all', { token: t.buyer });
  check('buyer cannot list all complaints', r.status === 403, r.json);

  console.log('Batch recall (C-28)');
  const o5 = await order([{ product_id: RC, quantity: 2 }]);
  await q(`UPDATE orders SET status = 'packing' WHERE id = $1`, [o5.id]);
  r = await call('POST', '/recalls', { token: t.admin, body: { product_id: RC, batch_number: 'RC-1', reason: 'CDSCO NSQ alert', source: 'CDSCO Sep-2026' } });
  check('admin recalls a batch; affected buyer notified', r.status === 201 && r.json.data?.orders_notified === 1 && r.json.data?.awaiting_dispatch === 1, r.json);
  const recallId = r.json.data?.id;
  r = await call('POST', '/recalls', { token: t.admin, body: { product_id: RC, batch_number: 'RC-1', reason: 'again please' } });
  check('same batch cannot be recalled twice', r.status === 409, r.json);
  r = await call('POST', `/fulfilment/shipments/${await shipmentOf(o5.id)}/pack`, { token: t.packer });
  check('recalled stock cannot be packed', r.status === 409 && /Recalled/.test(r.json.message), r.json);
  r = await call('GET', `/products/${RC}`, { token: t.buyer });
  check('recalled batch no longer counts as stock', Number(r.json.data?.stock_qty ?? r.json.data?.product?.stock_qty) === 0, r.json.data);
  const o6 = await call('POST', '/orders', { token: t.buyer, body: { address_id: addr, pincode: PIN, items: [{ product_id: RC, quantity: 1 }] } });
  check('recalled batch is not allocated to new orders', o6.status >= 400, o6.json);
  r = await call('GET', `/recalls/${recallId}`, { token: t.admin });
  check('recall detail lists the affected order', r.json.data?.affected?.some((a) => a.order_id === o5.id), r.json);
  r = await call('GET', '/recalls', { token: t.packer });
  check('non-admin cannot manage recalls', r.status === 403, r.json);
  await q(`UPDATE orders SET status = 'cancelled' WHERE id = $1`, [o5.id]);

  console.log('Privacy (C-40..C-44)');
  r = await call('GET', '/privacy/consents', { token: t.buyer });
  check('consent log shows the sign-up consents', r.json.data?.current?.length === 3, r.json);
  r = await call('PUT', '/privacy/consents/marketing', { token: t.buyer, body: { granted: true } });
  const mkt = r.json.data?.current?.find((c) => c.purpose === 'marketing');
  check('marketing opt-in appended', mkt?.granted === true && r.json.data?.history?.length === 4, r.json);
  r = await call('GET', '/privacy/export', { token: t.buyer });
  check('data export includes orders, prescriptions and complaints', r.status === 200 && r.json.orders?.length >= 2
    && r.json.prescriptions?.length === 1 && r.json.complaints?.length === 2, Object.keys(r.json));
  r = await call('POST', '/privacy/requests', { token: t.buyer2, body: { request_type: 'erasure', details: 'Close my account' } });
  const dr = r.json.data;
  check('buyer requests erasure', r.status === 201, r.json);
  r = await call('POST', '/privacy/requests', { token: t.buyer2, body: { request_type: 'erasure' } });
  check('duplicate pending request refused', r.status === 409, r.json);
  r = await call('GET', '/privacy/admin/requests?status=pending', { token: t.admin });
  check('admin sees the pending request', r.json.data?.requests?.some((x) => x.id === dr.id), r.json);
  const o7 = await order([{ product_id: OTC, quantity: 1 }], t.buyer2, addr2);
  await q(`UPDATE orders SET status = 'packing' WHERE id = $1`, [o7.id]);
  r = await call('PATCH', `/privacy/admin/requests/${dr.id}`, { token: t.admin, body: { action: 'complete', outcome: 'Erased' } });
  check('erasure blocked while an order is in progress', r.status === 409, r.json);
  await q(`UPDATE orders SET status = 'cancelled' WHERE id = $1`, [o7.id]);
  r = await call('PATCH', `/privacy/admin/requests/${dr.id}`, { token: t.admin, body: { action: 'complete', outcome: 'Account anonymised' } });
  const erased = (await q(`SELECT u.mobile, u.email, u.deleted_at, up.full_name FROM users u JOIN user_profiles up ON up.user_id = u.id WHERE u.id = $1`, [ids.buyer2]))[0];
  check('erasure anonymises the account', r.status === 200 && erased.full_name === 'Deleted user' && erased.email === null
    && erased.mobile !== people.buyer2.mobile && erased.deleted_at, erased);
  const kept = (await q(`SELECT COUNT(*)::int AS n FROM orders WHERE user_id = $1`, [ids.buyer2]))[0].n;
  check('order records are kept for the law', kept === 2, kept);
  r = await call('GET', '/privacy/consents', { token: t.buyer2 });
  check('erased account can no longer sign in', r.status === 401, r.status);

  console.log('Legal settings (C-04)');
  r = await call('PUT', '/admin/settings/legal.grievance_officer', { token: t.admin, body: { value: { name: 'A', email: 'nope', phone: '', address: '' } } });
  check('invalid grievance officer email refused', r.status === 422, r.json);
  const officer = { name: 'S4 Officer', email: 'grievance@dawabag.test', phone: '02532000000', address: 'Nashik' };
  const old = (await q(`SELECT value FROM app_settings WHERE key = 'legal.grievance_officer'`))[0].value;
  r = await call('PUT', '/admin/settings/legal.grievance_officer', { token: t.admin, body: { value: officer } });
  const info = (await call('GET', '/legal/info')).json.data;
  check('public legal info shows the grievance officer', r.status === 200 && info?.grievance_officer?.email === officer.email, info);
  await q(`UPDATE app_settings SET value = $1 WHERE key = 'legal.grievance_officer'`, [JSON.stringify(old)]);

  await cleanup(q);
  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll Sprint 4 checks passed');
}

main()
  .catch((e) => { failures++; console.error(e); })
  .finally(async () => { await db.end(); redis.disconnect(); process.exit(failures ? 1 : 0); });
