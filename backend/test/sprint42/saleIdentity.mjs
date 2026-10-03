// Sprint 42 A — the sale identity of each shipment is fixed at the sale (order placement) and
// cannot be changed afterwards (handover D15; C-05, C-07, C-08, C-13, C-33, C-46):
// seller licences and the licence each line was sold under, sale channel, buyer type and
// licences; the pharmacist of record is filled once at the check. Invoices and the sales
// register read the frozen record, not today's licence register.
import { createRequire } from 'module';
import { call, check, q } from '../sprint5/lib.mjs';
import { pdfText } from '../sprint30/pdfText.mjs';
import { P, PIN, V, addr, ids, inDays, placeOrder, plainClient, t, today, verifyStaff } from '../sprint39/fixtures.mjs';
import { LIC } from './fixtures.mjs';

const require = createRequire(import.meta.url);
const { Client } = require('pg');

let pays = 0;
/** Places an order (no prescription lines) and marks it paid as payment capture does. */
async function paidOrder(items) {
  const { r, order } = await placeOrder(items, { withRx: false });
  if (!order) throw new Error(`order not placed: ${JSON.stringify(r.json)}`);
  pays++;
  await q(`INSERT INTO payments (order_id, gateway_order_id, gateway_payment_id, status, amount_paise, paid_at, method)
           VALUES ($1, $2, $3, 'captured', $4, NOW(), 'upi')`, [order.id, `order_S42_${pays}_${Date.now()}`, `pay_S42_${pays}_${Date.now()}`, order.total_paise]);
  await q(`UPDATE orders SET status = 'packing' WHERE id = $1`, [order.id]);
  const rows = await q(`SELECT * FROM order_shipments WHERE order_id = $1`, [order.id]);
  return { order, own: rows.find((s) => s.seller_type === 'dawabag'), partner: rows.find((s) => s.seller_type === 'partner') };
}
const shipment = async (id) => (await q(`SELECT * FROM order_shipments WHERE id = $1`, [id]))[0];
const lines = (id) => q(`SELECT product_id, sale_licence_form, sale_licence_number, price_field FROM order_items WHERE shipment_id = $1`, [id]);
const identity = (s) => JSON.stringify([s.sale_channel, s.sale_buyer_type, s.seller_drug_licences, s.sale_licences, s.buyer_drug_licences,
  s.sale_identity_source, String(s.sale_identity_frozen_at)]);

/** The database's own answer to a statement: null when it ran, else the error code and message. */
async function refused(client, sql, params) {
  try { await client.query(sql, params); return null; } catch (e) { return { code: e.code, message: e.message }; }
}
/** A session as the API's restricted login (Sprint 41), when the environment names it. */
async function apiLogin() {
  if (!process.env.DB_APP_LOGIN || !process.env.DB_APP_PASSWORD) return null;
  const u = new URL(process.env.DATABASE_URL);
  u.username = process.env.DB_APP_LOGIN; u.password = process.env.DB_APP_PASSWORD;
  const c = new Client({ connectionString: u.toString() });
  await c.connect();
  return c;
}

export async function runSaleIdentity() {
  console.log('\nA. Sale identity per shipment, fixed at order placement');
  const a = await paidOrder([{ product_id: P.otc, quantity: 2 }, { product_id: P.feed, quantity: 1 }]);
  check('the order is split: Dawabag ships one line, the partner the other', !!a.own && !!a.partner, { own: !!a.own, partner: !!a.partner });
  for (const [who, s, number] of [['Dawabag', a.own, LIC.own20], ['partner', a.partner, LIC.partner20]]) {
    const ls = await lines(s.id);
    check(`${who} shipment: recorded at the sale — retail channel, buyer type, frozen`, s.sale_identity_source === 'sale' && s.sale_channel === 'retail'
      && s.sale_buyer_type === 'customer' && !!s.sale_identity_frozen_at && s.buyer_drug_licences === null,
    { source: s.sale_identity_source, channel: s.sale_channel, type: s.sale_buyer_type, frozen: s.sale_identity_frozen_at });
    check(`… every line sold under Form 20 ${number}, offer price`, ls.length === 1 && ls.every((l) => l.sale_licence_form === 'dl20'
      && l.sale_licence_number === number && l.price_field === 'offer'), ls);
    check('… the licences used kept with their number, form and valid-till', s.sale_licences?.length === 1 && s.sale_licences[0].number === number
      && s.sale_licences[0].form === 'dl20' && /^\d{4}-\d{2}-\d{2}$/.test(s.sale_licences[0].valid_upto ?? ''), s.sale_licences);
    check('… and every licence the seller held that day', s.seller_drug_licences?.some((l) => l.number === number) && s.seller_drug_licences.length >= 2, s.seller_drug_licences);
  }

  // ── A licence changes after the sale: the shipment's record does not ─────
  const before = { own: identity(await shipment(a.own.id)), partner: identity(await shipment(a.partner.id)) };
  await q(`UPDATE business_licences SET licence_number = $1 WHERE licence_number = $2`, [LIC.own20New, LIC.own20]);
  await q(`UPDATE party_licences SET licence_number = $1, valid_upto = $3 WHERE vendor_id = $2 AND licence_number = $4`, [LIC.partner20New, V.a, inDays(900), LIC.partner20]);
  check('licences renewed after the sale: neither shipment\'s record changes', identity(await shipment(a.own.id)) === before.own
    && identity(await shipment(a.partner.id)) === before.partner);
  check('… nor the line', (await lines(a.own.id))[0]?.sale_licence_number === LIC.own20);
  let r = await call('GET', `/invoices/shipments/${a.own.id}.pdf`, { token: t.buyer, raw: true });
  let text = r.status === 200 ? pdfText(r.buf) : '';
  check('the invoice prints the licence of the day of sale, not the renewed one', text.includes(`Retail sale under Form 20 No. ${LIC.own20}`)
    && !text.includes(LIC.own20New), text.slice(0, 600));
  r = await call('GET', `/invoices/shipments/${a.partner.id}.pdf`, { token: t.buyer, raw: true });
  text = r.status === 200 ? pdfText(r.buf) : '';
  check('… the partner\'s invoice too', text.includes(LIC.partner20) && !text.includes(LIC.partner20New), text.slice(0, 600));
  r = await call('GET', `/accounts/reports/sales-register?from=${today()}&to=${today()}`, { token: t.opsAdmin });
  const row = r.json.data?.rows?.find?.((x) => x.invoice_number === a.own.invoice_number) ?? (Array.isArray(r.json.data) ? r.json.data.find((x) => x.invoice_number === a.own.invoice_number) : null);
  check('the sales register: channel and the licence sold under, from the sale record', row?.sale_channel === 'retail'
    && row?.sold_under_licences === `Form 20: ${LIC.own20}` && row?.sale_record === 'sale', row ?? r.json);
  const b = await paidOrder([{ product_id: P.otc, quantity: 1 }]);
  check('a sale after the renewal is recorded under the new number', (await lines(b.own.id))[0]?.sale_licence_number === LIC.own20New);

  // ── The database refuses changes (C-46) ───────────────────────────────────
  const plain = await plainClient();
  const api = await apiLogin();
  try {
    for (const [label, sql] of [
      ['sale channel', `UPDATE order_shipments SET sale_channel = 'wholesale' WHERE id = $1`],
      ['seller licences', `UPDATE order_shipments SET seller_drug_licences = '[]' WHERE id = $1`],
      ['licences used', `UPDATE order_shipments SET sale_licences = '[]' WHERE id = $1`],
      ['buyer licences', `UPDATE order_shipments SET buyer_drug_licences = '[{"form":"dl20b","number":"X"}]' WHERE id = $1`],
      ['frozen time', `UPDATE order_shipments SET sale_identity_frozen_at = NULL WHERE id = $1`],
    ]) {
      const e = await refused(plain, sql, [a.own.id]);
      check(`trigger refuses a change of the ${label} (even to the database owner without the maintenance role)`, e?.code === 'P0001'
        && /fixed at the sale/.test(e.message), e);
    }
    let e = await refused(plain, `UPDATE order_items SET sale_licence_number = 'S42-OTHER' WHERE shipment_id = $1`, [a.own.id]);
    check('… the licence a line was sold under', e?.code === 'P0001', e);
    e = await refused(plain, `UPDATE order_items SET price_field = 'ptr' WHERE shipment_id = $1`, [a.own.id]);
    check('… the price field', e?.code === 'P0001', e);
    if (api) {
      e = await refused(api, `UPDATE order_shipments SET sale_channel = 'wholesale' WHERE id = $1`, [a.own.id]);
      check('… and to the API\'s own login', e?.code === 'P0001', e);
    }
    e = await refused(plain, `UPDATE order_shipments SET courier_partner = 'S42 Courier' WHERE id = $1`, [a.own.id]);
    check('other shipment fields still change (courier, status…)', e === null, e);
    // A trade buyer's licence snapshot on the order: kept as written
    await q(`UPDATE orders SET buyer_drug_licences = '[{"form":"dl20","label":"Form 20","number":"S42-BUYER-20","valid_upto":null}]' WHERE id = $1`, [b.order.id]);
    e = await refused(plain, `UPDATE orders SET buyer_drug_licences = '[]' WHERE id = $1`, [b.order.id]);
    check('the order\'s buyer-licence snapshot cannot be changed once written', e?.code === 'P0001', e);
    // The maintenance role (operators, retention purge, test clean-up) still can
    await q(`UPDATE order_shipments SET sale_channel = 'retail' WHERE id = $1`, [a.own.id]);
    check('the maintenance role may (operators / clean-up only)', true);

    // ── Pharmacist of record: filled once at the check ──────────────────────
    console.log('\nPharmacist of record: filled once at the check, then final');
    check('before the check: no pharmacist and no registration recorded', !(await shipment(a.own.id)).pharmacist_registration);
    e = await refused(plain, `UPDATE order_shipments SET pharmacist_check = 'held', pharmacist_name = 'S42 Someone', pharmacist_reg_no = 'X',
      pharmacist_checked_at = NOW(), pharmacist_check_note = 'waiting for the buyer' WHERE id = $1`, [a.own.id]);
    check('… a hold may be written before the decision', e === null, e);
    await q(`UPDATE order_shipments SET pharmacist_check = 'pending', pharmacist_name = NULL, pharmacist_reg_no = NULL, pharmacist_checked_at = NULL,
      pharmacist_check_note = NULL WHERE id = $1`, [a.own.id]);
    r = await call('POST', `/fulfilment/shipments/${a.own.id}/check`, { token: t.pharmacist, body: { decision: 'hold', reason: 'Calling the buyer about the dose' } });
    check('a pharmacist holds the shipment', r.status === 200, r.json);
    r = await call('POST', `/fulfilment/shipments/${a.own.id}/check`, { token: t.pharmacistB, body: { decision: 'release' } });
    let s = await shipment(a.own.id);
    check('another pharmacist releases it: the release names them, with their registration as at the check', r.status === 200
      && s.pharmacist_check === 'released' && s.pharmacist_checked_by === ids.pharmacistB && s.pharmacist_reg_no === 'MSPC-S39-2'
      && s.pharmacist_registration?.registration_no === 'MSPC-S39-2' && s.pharmacist_registration?.kind === 'staff'
      && s.pharmacist_registration?.state_council === 'Maharashtra State Pharmacy Council' && s.pharmacist_registration?.verified === true
      && s.pharmacist_registration?.recorded === 'at_check', { r: r.json, s: { by: s.pharmacist_checked_by, reg: s.pharmacist_registration } });
    const released = JSON.stringify([s.pharmacist_name, s.pharmacist_reg_no, s.pharmacist_checked_by, String(s.pharmacist_checked_at), s.pharmacist_registration]);
    r = await call('POST', `/fulfilment/shipments/${a.own.id}/check`, { token: t.pharmacist, body: { decision: 'release' } });
    check('a second decision is refused', r.status === 409, r.json);
    for (const [label, sql] of [
      ['name', `UPDATE order_shipments SET pharmacist_name = 'S42 Someone Else' WHERE id = $1`],
      ['registration number', `UPDATE order_shipments SET pharmacist_reg_no = 'MSPC-OTHER' WHERE id = $1`],
      ['registration snapshot', `UPDATE order_shipments SET pharmacist_registration = '{"registration_no":"X"}' WHERE id = $1`],
      ['decision', `UPDATE order_shipments SET pharmacist_check = 'pending' WHERE id = $1`],
    ]) {
      e = await refused(plain, sql, [a.own.id]);
      check(`trigger refuses a change of the pharmacist's ${label} after the release`, e?.code === 'P0001', e);
    }
    r = await verifyStaff(ids.pharmacistB, 'MSPC-S39-2', { state_council: 'S42 Renamed Council', valid_till: inDays(700) });
    s = await shipment(a.own.id);
    check('the pharmacist\'s registration is renewed later: the shipment keeps the one of the check', r.status === 200
      && JSON.stringify([s.pharmacist_name, s.pharmacist_reg_no, s.pharmacist_checked_by, String(s.pharmacist_checked_at), s.pharmacist_registration]) === released,
    s.pharmacist_registration);
    r = await call('GET', `/invoices/shipments/${a.own.id}.pdf`, { token: t.buyer, raw: true });
    text = r.status === 200 ? pdfText(r.buf) : '';
    check('the invoice names the pharmacist with the council as at the check', /Checked by pharmacist .*MSPC-S39-2 \(Maharashtra State Pharmacy Council\)/.test(text), text.slice(-700));

    // Partner shipment: released by the partner's own pharmacist, snapshot of that registration
    r = await call('POST', `/partner/shipments/${a.partner.id}/check`, { token: t.partner, body: { decision: 'release', vendor_pharmacist_id: V.pharmacist } });
    s = await shipment(a.partner.id);
    check('the partner\'s pharmacist releases the partner shipment: their registration kept', r.status === 200
      && s.pharmacist_registration?.kind === 'partner' && s.pharmacist_registration?.registration_no === 'MSPC-S39-P1'
      && s.pharmacist_registration?.valid_till === inDays(365), { r: r.json, reg: s.pharmacist_registration });
    e = await refused(plain, `UPDATE order_shipments SET vendor_pharmacist_id = NULL WHERE id = $1`, [a.partner.id]);
    check('… and cannot be changed afterwards', e?.code === 'P0001', e);
  } finally {
    await plain.end();
    await api?.end();
  }

  // ── Shipments from before Sprint 42: filled by the migration, marked backfilled ──
  const open = (await q(`SELECT COUNT(*)::int AS n FROM order_shipments WHERE sale_identity_frozen_at IS NULL`))[0].n;
  const bf = (await q(`SELECT COUNT(*)::int AS n, COUNT(*) FILTER (WHERE sale_channel IS NOT NULL AND sale_licences IS NOT NULL)::int AS complete
                       FROM order_shipments WHERE sale_identity_source = 'backfill'`))[0];
  check('every shipment has a frozen sale record (older ones backfilled and marked so)', open === 0 && bf.n === bf.complete, { open, backfilled: bf });
  void addr; void PIN;
}
