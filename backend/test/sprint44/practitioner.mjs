// Sprint 44 C — sales to doctors and medical institutions: FDA Maharashtra (Pune Division) circular
// No. Drug/Wholesalers Memo./16/2026/1 dated 30-09-2026; Drugs Rules 1945 r.64(2) (sale under a
// registered pharmacist's supervision) and r.65(9)(b) (no supply to an RMP without a signed
// written order; records with a copy of the registration certificate).
import { createRequire } from 'module';
import { call, check, q } from '../sprint5/lib.mjs';
import { checkoutPayment } from '../fakes/razorpay.mjs';
import { P, PIN, addr, ids, inDays, people, t, today } from '../sprint39/fixtures.mjs';

const require = createRequire(import.meta.url);
const { Client } = require('pg');

async function apiLogin() {
  if (!process.env.DB_APP_LOGIN || !process.env.DB_APP_PASSWORD) return null;
  const u = new URL(process.env.DATABASE_URL);
  u.username = process.env.DB_APP_LOGIN; u.password = process.env.DB_APP_PASSWORD;
  const c = new Client({ connectionString: u.toString() });
  await c.connect();
  return c;
}
async function refused(client, sql, params) {
  try { await client.query(sql, params); return null; } catch (e) { return { code: e.code, message: e.message }; }
}
const orderCount = async () => (await q(`SELECT COUNT(*)::int AS n FROM orders WHERE user_id = $1`, [ids.doctor]))[0].n;
const place = (items, extra = {}) => call('POST', '/orders', { token: t.doctor, noAutoRx: true,
  body: { address_id: addr.doctor, pincode: PIN, items, practitioner_declaration: true, ...extra } });
const decide = (body) => call('POST', `/practitioner-sales/practitioners/${ids.doctor}/registration`, { token: t.opsAdmin,
  body: { registration_number: 'MMC-S44-01', council: 'Maharashtra Medical Council', name_as_per_register: 'Asha Rao', ...body } });
const sign = (items, extra = {}) => call('POST', '/written-orders/requisition', { token: t.doctor,
  body: { items, typed_name: 'Dr Asha Rao', password: people.doctor.password, declaration: true, ...extra } });

export async function runPractitioner() {
  console.log('\nC1. A doctor\'s registration is verified by Dawabag staff, with the certificate copy, before any sale');
  let r = await call('GET', '/practitioner-sales/me', { token: t.doctor });
  check('the doctor sees: registration waiting for our check, cannot order yet', r.status === 200 && r.json.data?.applies === true
    && r.json.data.can_order === false && r.json.data.status === 'pending', r.json.data);
  const n0 = await orderCount();
  r = await place([{ product_id: P.otc, quantity: 2 }]);
  check('order from a doctor whose registration is not verified → 403 PRACTITIONER_REGISTRATION_INVALID, nothing placed',
    r.status === 403 && r.json.code === 'PRACTITIONER_REGISTRATION_INVALID' && /verified/.test(r.json.message) && (await orderCount()) === n0, r.json);
  r = await decide({ decision: 'verify' });
  check('staff cannot verify without the valid-till date', r.status === 400 && /valid/.test(r.json.message ?? ''), r.json);
  r = await decide({ decision: 'verify', valid_till: inDays(400) });
  check('… nor without an uploaded certificate copy → 409 CERTIFICATE_MISSING', r.status === 409 && r.json.code === 'CERTIFICATE_MISSING', r.json);
  // The certificate: uploaded by the doctor (object store); seeded here when the API has no store
  await q(`INSERT INTO kyc_documents (user_id, document_type, storage_key, original_name, mime_type, size_bytes)
           VALUES ($1, 'nmc_certificate', 'kyc/s44/nmc_certificate/one.pdf', 'certificate.pdf', 'application/pdf', 1000)
           ON CONFLICT (user_id, document_type) DO UPDATE SET storage_key = EXCLUDED.storage_key`, [ids.doctor]);
  r = await call('GET', '/practitioner-sales/practitioners', { token: t.pharmacist });
  check('the work list shows the doctor waiting, with the certificate', r.status === 200
    && r.json.data.practitioners.some((p) => p.user_id === ids.doctor && !p.can_order && p.certificate_document_id), r.json.data);
  r = await call('POST', `/practitioner-sales/practitioners/${ids.doctor}/registration`, { token: t.pharmacist,
    body: { decision: 'verify', registration_number: 'MMC-S44-01', council: 'Maharashtra Medical Council', valid_till: inDays(400) } });
  check('only admins decide (a pharmacist may look) → 403', r.status === 403, r.status);
  r = await decide({ decision: 'verify', valid_till: inDays(400) });
  const u = (await q(`SELECT nmc_status, to_char(nmc_valid_till, 'YYYY-MM-DD') AS till, nmc_certificate_key, nmc_verified_by FROM users WHERE id = $1`, [ids.doctor]))[0];
  check('verified: status, valid till and the copy checked are recorded', r.status === 200 && u.nmc_status === 'verified' && u.till === inDays(400)
    && u.nmc_certificate_key === 'kyc/s44/nmc_certificate/one.pdf' && u.nmc_verified_by === ids.opsAdmin, { r: r.json, u });
  check('audit: practitioner_registration_verified', (await q(`SELECT 1 FROM audit_logs WHERE action = 'practitioner_registration_verified' AND user_id = $1`, [ids.doctor])).length === 1);

  await q(`UPDATE users SET nmc_valid_till = CURRENT_DATE - 1 WHERE id = $1`, [ids.doctor]);
  r = await place([{ product_id: P.otc, quantity: 2 }]);
  check('a lapsed registration: refused with the valid-till date in the message', r.status === 403 && r.json.code === 'PRACTITIONER_REGISTRATION_INVALID'
    && r.json.message.includes(inDays(-1)), r.json);
  r = await decide({ decision: 'suspend', reason: 'Council lists the registration as suspended' });
  r = await place([{ product_id: P.otc, quantity: 2 }]);
  check('a suspended registration: refused', r.status === 403 && /suspended/.test(r.json.message ?? ''), r.json);
  check('… the account itself stays approved (the registration is what stops the sale)', (await q(`SELECT kyc_status FROM users WHERE id = $1`, [ids.doctor]))[0].kyc_status === 'approved');
  r = await decide({ decision: 'verify', valid_till: inDays(400) });
  check('verified again', r.status === 200 && r.json.data?.status === 'verified', r.json);

  console.log('\nC2. Every order carries a signed written order (r.65(9)(b)), final once made');
  const n1 = await orderCount();
  r = await place([{ product_id: P.otc, quantity: 2 }]);
  check('no written order → 422 WRITTEN_ORDER_REQUIRED before any payment, nothing placed', r.status === 422 && r.json.code === 'WRITTEN_ORDER_REQUIRED'
    && (await orderCount()) === n1, r.json);
  r = await call('POST', '/orders/preview', { token: t.doctor, body: { address_id: addr.doctor, pincode: PIN, items: [{ product_id: P.otc, quantity: 2 }] } });
  check('checkout preview says a written order is needed', r.status === 200 && r.json.data?.written_order_required === true, r.json.data?.written_order_required);
  r = await call('POST', '/written-orders/requisition/preview', { token: t.doctor, body: { items: [{ product_id: P.otc, quantity: 2 }] } });
  check('the requisition text to sign names the doctor, registration and r.65(9)(b)', r.status === 200 && /r\.65\(9\)\(b\)/.test(r.json.data?.text ?? '')
    && /MMC-S44-01/.test(r.json.data.text) && /S39 S39-OTC — 2 unit/.test(r.json.data.text), r.json.data?.text);
  r = await sign([{ product_id: P.otc, quantity: 2 }], { password: 'wrong-password' });
  check('signing with a wrong password → 400, nothing made', r.status === 400 && r.json.code === 'WRITTEN_ORDER_SIGNATURE_INVALID', r.json);
  r = await sign([{ product_id: P.otc, quantity: 2 }], { typed_name: 'Someone Else' });
  check('… with a name that is not the registered doctor\'s → 400', r.status === 400 && /as on the medical council register/.test(r.json.message ?? ''), r.json);
  r = await sign([{ product_id: P.otc, quantity: 2 }], { declaration: false });
  check('… without the declaration → 400', r.status === 400, r.json);
  r = await call('POST', '/written-orders/requisition', { token: t.buyer, body: { items: [{ product_id: P.otc, quantity: 2 }], typed_name: 'S39 Buyer', password: 'Passw0rd!', declaration: true } });
  check('a consumer cannot sign one', r.status === 403, r.json);
  r = await sign([{ product_id: P.otc, quantity: 2 }]);
  const wo = r.json.data;
  check('signed in the app by the doctor\'s own login: kept with the hash of the signed text', r.status === 201 && wo?.kind === 'in_app'
    && /^[0-9a-f]{64}$/.test(wo.content_sha256 ?? ''), r.json);
  r = await place([{ product_id: P.otc, quantity: 3 }], { written_order_id: wo.id });
  check('an order for more than the written order covers → 422 WRITTEN_ORDER_NOT_COVERING', r.status === 422 && r.json.code === 'WRITTEN_ORDER_NOT_COVERING', r.json);
  r = await place([{ product_id: P.otc, quantity: 2 }], { written_order_id: wo.id });
  const order = r.json.data?.order;
  check('with the written order: placed, the written order linked to it', r.status === 201 && order?.written_order?.id === wo.id
    && (await q(`SELECT order_id FROM written_orders WHERE id = $1`, [wo.id]))[0].order_id === order.id, r.json);
  r = await place([{ product_id: P.otc, quantity: 2 }], { written_order_id: wo.id });
  check('the same written order cannot be used again → 409 WRITTEN_ORDER_USED', r.status === 409 && r.json.code === 'WRITTEN_ORDER_USED', r.json);
  const api = await apiLogin();
  if (api) {
    try {
      let e = await refused(api, `UPDATE written_orders SET items = '[]' WHERE id = $1`, [wo.id]);
      check('database (API login): a written order cannot be changed', e?.code === 'P0001' && /cannot be changed/.test(e.message), e);
      e = await refused(api, `UPDATE written_orders SET order_id = NULL, attached_at = NULL WHERE id = $1`, [wo.id]);
      check('… nor moved off its order', e?.code === 'P0001', e);
      e = await refused(api, `DELETE FROM written_orders WHERE id = $1`, [wo.id]);
      check('… nor deleted', e?.code === 'P0001', e);
    } finally { await api.end(); }
  }
  // (a) an uploaded signed requisition: to the private object store only
  const form = new FormData();
  form.append('file', new Blob([Buffer.from('%PDF-1.4\n% S44 signed requisition\n')], { type: 'application/pdf' }), 'requisition.pdf');
  const up = await fetch(`${(process.env.API_URL || 'http://localhost:4000')}/api/v1/written-orders/upload`, {
    method: 'POST', headers: { Authorization: `Bearer ${t.doctor}` }, body: form });
  const upJson = await up.json().catch(() => ({}));
  check(process.env.AWS_S3_BUCKET ? 'an uploaded signed requisition is kept (object store, SHA-256)' : 'without an object store an upload is refused (nothing kept locally)',
    process.env.AWS_S3_BUCKET ? up.status === 201 && /^[0-9a-f]{64}$/.test(upJson.data?.sha256 ?? '') : up.status === 503, { status: up.status, upJson });

  console.log('\nC3. Supervised by the pharmacist (r.64(2)); the sale record and the register');
  const c = await call('POST', '/payments/create-order', { token: t.doctor, body: { order_id: order.id } });
  await call('POST', '/payments/verify', { token: t.doctor, body: checkoutPayment(c.json.data.razorpay_order_id, { status: 'captured' }) });
  const own = (await q(`SELECT id FROM order_shipments WHERE order_id = $1 AND seller_type = 'dawabag'`, [order.id]))[0].id;
  r = await call('GET', `/fulfilment/checks/${order.id}`, { token: t.pharmacist });
  check('the pharmacist\'s check shows the signed written order', r.status === 200 && r.json.data?.written_orders?.some((w) => w.id === wo.id), r.json.data?.written_orders);
  // Without its written order a doctor order cannot be approved (stand-in: link removed by the maintenance role)
  await q(`UPDATE written_orders SET order_id = NULL, attached_at = NULL WHERE id = $1`, [wo.id]);
  r = await call('POST', `/fulfilment/shipments/${own}/check`, { token: t.pharmacist, body: { decision: 'release' } });
  check('no written order on a doctor order → the pharmacist cannot release it (409 WRITTEN_ORDER_REQUIRED)', r.status === 409 && r.json.code === 'WRITTEN_ORDER_REQUIRED', r.json);
  await q(`UPDATE written_orders SET order_id = $2, attached_at = NOW() WHERE id = $1`, [wo.id, order.id]);
  r = await call('POST', `/fulfilment/shipments/${own}/check`, { token: t.pharmacist, body: { decision: 'release' } });
  const s = (await q(`SELECT invoice_number, sale_channel, sale_buyer_type, buyer_registration, pharmacist_name, pharmacist_reg_no FROM order_shipments WHERE id = $1`, [own]))[0];
  check('released by the registered pharmacist: invoiced as a sale by way of wholesale to a doctor, the pharmacist named', r.status === 200
    && !!s.invoice_number && s.sale_channel === 'wholesale' && s.sale_buyer_type === 'doc_hospital' && s.pharmacist_reg_no === 'MSPC-S39-1', s);
  check('the sale record keeps the doctor\'s registration as on the day of sale (number, council, valid till, certificate copy)',
    s.buyer_registration?.registration_number === 'MMC-S44-01' && s.buyer_registration.council === 'Maharashtra Medical Council'
    && s.buyer_registration.valid_till === inDays(400) && s.buyer_registration.certificate_key === 'kyc/s44/nmc_certificate/one.pdf', s.buyer_registration);
  r = await call('GET', `/practitioner-sales/register?from=${today()}&to=${today()}`, { token: t.opsAdmin });
  const row = (r.json.data?.rows ?? []).find((x) => x.invoice_number === s.invoice_number);
  check('the register "Sales to doctors and medical institutions" lists the sale with everything the circular asks for', r.status === 200 && row
    && row.registration_number === 'MMC-S44-01' && row.council === 'Maharashtra Medical Council' && row.registration_valid_till === inDays(400)
    && row.certificate_on_file === true && row.written_order_ids.includes(wo.id) && row.product_name === 'S39 S39-OTC' && row.quantity === 2
    && row.batch_number === 'S39-B1' && row.pharmacist_name && row.pharmacist_reg_no === 'MSPC-S39-1'
    && row.written_order_links[0] === `/written-orders/${wo.id}/document` && row.certificate_link === `/written-orders/${wo.id}/certificate`, row ?? r.json);
  r = await call('GET', `/practitioner-sales/register?from=${today()}&to=${today()}&format=csv`, { token: t.opsAdmin, raw: true });
  const csv = r.buf?.toString() ?? '';
  check('… and as CSV for the inspector', r.status === 200 && /text\/csv/.test(r.type ?? '') && csv.startsWith('invoice_date,invoice_number')
    && csv.includes(s.invoice_number) && csv.includes('MMC-S44-01'), csv.slice(0, 300));
  r = await call('GET', `/partner/practitioner-sales?from=${today()}&to=${today()}`, { token: t.partner });
  check('a partner sees only its own sales to doctors (not Dawabag\'s)', r.status === 200
    && !(r.json.data?.rows ?? []).some((x) => x.invoice_number === s.invoice_number), r.json);
  r = await call('GET', `/practitioner-sales/register?from=${today()}&to=${today()}`, { token: t.buyer });
  check('buyers cannot read the register', r.status === 403, r.status);
  r = await call('GET', `/written-orders/${wo.id}/link`, { token: t.opsAdmin });
  const link = r.json.data?.url;
  check('staff open the written order (a 5-minute signed link to the signed requisition)', r.status === 200 && /document\.pdf\?exp=/.test(link ?? ''), r.json);
  const pdf = await fetch(`${(process.env.API_URL || 'http://localhost:4000')}${link}`);
  check('… which is the requisition as a PDF made on demand', pdf.status === 200 && /application\/pdf/.test(pdf.headers.get('content-type') ?? ''), pdf.status);
  r = await call('GET', `/written-orders/${wo.id}`, { token: t.other });
  check('another buyer cannot see it', r.status === 404, r.status);
  check('every view is logged (C-41)', (await q(`SELECT 1 FROM audit_logs WHERE action = 'written_order_viewed' AND new_value->>'written_order_id' = $1`, [wo.id])).length >= 1);

  console.log('\nC4. A doctor adds to an order before approval: a written order for what is added');
  const wo2 = (await sign([{ product_id: P.otc, quantity: 1 }])).json.data;
  r = await place([{ product_id: P.otc, quantity: 1 }], { written_order_id: wo2.id });
  const o2 = r.json.data?.order;
  const c2 = await call('POST', '/payments/create-order', { token: t.doctor, body: { order_id: o2.id } });
  await call('POST', '/payments/verify', { token: t.doctor, body: checkoutPayment(c2.json.data.razorpay_order_id, { status: 'captured' }) });
  r = await call('POST', `/orders/${o2.id}/edit`, { token: t.doctor, body: { add: [{ product_id: P.rx, quantity: 2 }] } });
  check('adding without a written order → 422 WRITTEN_ORDER_REQUIRED (no prescription asked: a doctor is exempt)', r.status === 422
    && r.json.code === 'WRITTEN_ORDER_REQUIRED', r.json);
  const wo3 = (await sign([{ product_id: P.rx, quantity: 2 }])).json.data;
  r = await call('POST', `/orders/${o2.id}/edit`, { token: t.doctor, body: { add: [{ product_id: P.rx, quantity: 2 }], written_order_id: wo3.id } });
  const link3 = (await q(`SELECT order_id, order_edit_id FROM written_orders WHERE id = $1`, [wo3.id]))[0];
  check('with a signed written order for it → accepted; the written order is linked to the order and the change', r.status === 200
    && link3.order_id === o2.id && link3.order_edit_id === r.json.data.id && r.json.data.extra_status === 'awaiting_payment', { r: r.json, link3 });
}
