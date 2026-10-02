// Sprint 35 A — a registered pharmacist checks and releases EVERY order before packing
// (owner decision 2026-10-02, C-08): non-prescription orders, credit / trade orders,
// prescription orders (the prescription review is the one check) and partner
// shipments (the partner's own registered pharmacist). Hold and refuse with a reason;
// a refusal cancels and refunds (C-37); every step is in the audit log (C-46).
import { call, check, q } from '../sprint5/lib.mjs';
import { P, PIN, VP, addr, ids, paidOrder, t } from './fixtures.mjs';

const waitFor = async (sql, params, ms = 15000) => {
  const end = Date.now() + ms;
  let rows = [];
  while (Date.now() < end) { rows = await q(sql, params); if (rows.length) return rows; await new Promise((r) => setTimeout(r, 250)); }
  return rows;
};
const ship = async (id) => (await q(`SELECT * FROM order_shipments WHERE id = $1`, [id]))[0];
const audits = (shipmentId) => q(`SELECT action, performed_by, new_value, notes FROM audit_logs
  WHERE action LIKE 'pharmacist_check_%' AND new_value->>'shipment_id' = $1 ORDER BY created_at`, [shipmentId]);
const decide = (token, id, body) => call('POST', `/fulfilment/shipments/${id}/check`, { token, body });
const pack = (id) => call('POST', `/fulfilment/shipments/${id}/pack`, { token: t.packer });

export async function runOwnOrder() {
  console.log('A. A non-prescription order waits for the pharmacist before packing');
  const a = await paidOrder([{ product_id: P.own, quantity: 5 }]);
  let r = await call('GET', '/fulfilment/queue?stage=pack', { token: t.packer });
  const queued = r.json.data?.items?.find((i) => i.shipment_id === a.own);
  check('the pack queue shows it as waiting for the pharmacist', queued?.pharmacist_check === 'pending', queued);
  r = await pack(a.own);
  check('packing is refused until a pharmacist releases it', r.status === 409 && /Waiting for the pharmacist check/.test(r.json.message), r.json);
  r = await call('POST', `/fulfilment/shipments/${a.own}/dispatch`, { token: t.packer, body: { courier_partner: 'Delhivery', awb_number: 'S35AWB0', seal_number: 'SEAL-S35-0' } });
  check('dispatch is refused too', r.status === 409, r.json);

  r = await call('GET', '/fulfilment/queue?stage=check', { token: t.pharmacist });
  const item = r.json.data?.items?.find((i) => i.shipment_id === a.own);
  check('the pharmacist check queue lists the paid order with its lines', item?.order_id === a.order.id && item?.lines?.[0]?.quantity === 5, item);
  check('…and flags the quantity at the per-order limit', item?.signals?.some((s) => /limit per order/.test(s.signal)), item?.signals);
  r = await call('GET', '/fulfilment/queue?stage=check', { token: t.packer });
  check('packers cannot see the check queue', r.status === 403, r.status);
  r = await decide(t.packer, a.own, { decision: 'release' });
  check('a packer cannot release an order', r.status === 403, r.status);
  r = await decide(t.pharmacistNoReg, a.own, { decision: 'release' });
  check('a pharmacist without a registration number cannot release', r.status === 403 && /registration number/.test(r.json.message), r.json);
  r = await call('GET', `/fulfilment/checks/${a.order.id}`, { token: t.pharmacist });
  check('order check detail: lines and each shipment\'s state', r.status === 200 && r.json.data?.lines?.length === 1
    && r.json.data?.shipments?.[0]?.pharmacist_check === 'pending', r.json.data);

  console.log('Hold, then release');
  r = await decide(t.pharmacist, a.own, { decision: 'hold', reason: 'ok' });
  check('a hold needs a reason', r.status === 400, r.json);
  r = await decide(t.pharmacist, a.own, { decision: 'hold', reason: 'Calling the buyer about the quantity' });
  check('pharmacist puts the order on hold', r.status === 200 && r.json.data?.pharmacist_check === 'held', r.json);
  r = await pack(a.own);
  check('a held order cannot be packed; the packer sees why', r.status === 409 && /On hold by the pharmacist: Calling the buyer/.test(r.json.message), r.json);
  r = await call('GET', `/orders/${a.order.id}`, { token: t.buyer });
  check('the buyer sees "on hold" but not the staff note', r.json.data?.pharmacist_check === 'held'
    && r.json.data?.shipments?.[0]?.pharmacist_check_note === null, r.json.data?.shipments?.[0]);
  const held = await waitFor(`SELECT 1 FROM notifications WHERE user_id = $1 AND type = 'order_on_hold'`, [ids.buyer]);
  check('the buyer is told the pharmacist will contact them', held.length === 1, held);
  r = await decide(t.pharmacist, a.own, { decision: 'hold', reason: 'Again on hold please' });
  check('a held order cannot be held again', r.status === 409, r.json);

  r = await decide(t.pharmacist, a.own, { decision: 'release' });
  const s = await ship(a.own);
  check('pharmacist releases it; name and registration number recorded', r.status === 200 && s.pharmacist_check === 'released'
    && s.pharmacist_name === 'S35 Pharmacist' && s.pharmacist_reg_no === 'MSPC-S35-1' && s.pharmacist_checked_by === ids.pharmacist && !!s.pharmacist_checked_at, s);
  r = await decide(t.pharmacist, a.own, { decision: 'release' });
  check('it cannot be released twice', r.status === 409, r.json);
  const trail = await audits(a.own);
  check('audit log: held then released, by the pharmacist, with name and reg. no. (C-46)',
    trail.map((x) => x.action).join() === 'pharmacist_check_held,pharmacist_check_released'
    && trail.every((x) => x.performed_by === ids.pharmacist) && trail[1].new_value.pharmacist_reg_no === 'MSPC-S35-1'
    && trail[1].new_value.via === 'order_check' && trail[0].notes === 'Calling the buyer about the quantity', trail);
  r = await call('GET', '/fulfilment/queue?stage=check', { token: t.pharmacist });
  check('a released order leaves the check queue', !r.json.data?.items?.some((i) => i.shipment_id === a.own), r.json.data?.items?.length);
  r = await pack(a.own);
  check('now it can be packed', r.status === 200, r.json);
  r = await call('GET', `/orders/${a.order.id}`, { token: t.buyer });
  check('the buyer\'s order shows "checked by pharmacist" with name and reg. no.', r.json.data?.pharmacist_check === 'released'
    && r.json.data?.shipments?.[0]?.pharmacist_name === 'S35 Pharmacist' && r.json.data?.shipments?.[0]?.pharmacist_reg_no === 'MSPC-S35-1', r.json.data?.shipments);
  r = await call('GET', `/invoices/shipments/${a.own}.pdf`, { token: t.buyer, raw: true });
  check('the invoice PDF still renders (logo + pharmacist line)', r.status === 200 && r.buf.subarray(0, 4).toString() === '%PDF', r.status);
}

export async function runCreditOrder() {
  console.log('B. A credit (trade) order is checked from the moment it is placed');
  const r0 = await call('POST', '/orders', { token: t.trader, body: { address_id: addr.trader, pincode: PIN, payment_terms: 'net_30', items: [{ product_id: P.own, quantity: 1 }] } });
  const o = r0.json.data?.order;
  check('credit order placed and confirmed', r0.status === 201 && o?.status === 'confirmed', r0.json);
  const sid = (await q(`SELECT id FROM order_shipments WHERE order_id = $1`, [o?.id]))[0]?.id;
  const r = await call('GET', '/fulfilment/queue?stage=check', { token: t.pharmacist });
  check('it is in the pharmacist check queue straight away', r.json.data?.items?.some((i) => i.shipment_id === sid && i.payment_terms === 'net_30'), r.json.data?.items?.map((i) => i.order_number));
  check('and cannot be packed yet', (await pack(sid)).status === 409);
}

export async function runRxOrder() {
  console.log('C. A prescription order: the prescription review is the one check');
  const a = await paidOrder([{ product_id: P.rx, quantity: 2 }, { product_id: P.own, quantity: 1 }], 'rx_pending');
  let r = await call('GET', '/fulfilment/queue?stage=check', { token: t.pharmacist });
  check('a prescription order waits in the prescription list, not the order check list', !r.json.data?.items?.some((i) => i.shipment_id === a.own), r.json.data?.items?.length);
  r = await decide(t.pharmacist, a.own, { decision: 'release' });
  check('releasing it without the prescription review is refused, plainly', r.status === 409 && /review the prescription/.test(r.json.message), r.json);
  const rx = (await q(`INSERT INTO prescriptions (user_id, order_id, s3_key, file_type) VALUES ($1, $2, 'test/s35.jpg', 'jpg') RETURNING id`, [ids.buyer, a.order.id]))[0].id;
  r = await call('POST', `/fulfilment/prescriptions/${rx}/verify`, { token: t.pharmacist, body: { prescriber_name: 'Dr. S35 Kulkarni',
    prescriber_reg_no: 'MMC-S35-1', prescribed_on: new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10), patient_name: 'S35 Buyer',
    valid_days: 90, items: [{ product_id: P.rx, prescribed_qty: 4 }] } });
  const s = await ship(a.own);
  check('verifying the prescription also releases Dawabag\'s shipment (single step)', r.status === 200 && r.json.data?.shipments_released === 1
    && s.pharmacist_check === 'released' && s.pharmacist_reg_no === 'MSPC-S35-1', { r: r.json, s });
  const trail = await audits(a.own);
  check('audit log names it a release through the prescription review', trail.length === 1 && trail[0].new_value.via === 'prescription_review', trail);
  r = await call('GET', '/fulfilment/queue?stage=check', { token: t.pharmacist });
  check('nothing left for a second check', !r.json.data?.items?.some((i) => i.shipment_id === a.own));
  r = await pack(a.own);
  check('packing goes ahead', r.status === 200, r.json);
}

export async function runReject() {
  console.log('D. The pharmacist declines to supply: cancelled and refunded (C-37)');
  const a = await paidOrder([{ product_id: P.own, quantity: 1 }]);
  let r = await decide(t.pharmacist, a.own, { decision: 'reject' });
  check('a refusal needs a reason', r.status === 400, r.json);
  r = await decide(t.pharmacist, a.own, { decision: 'reject', reason: 'Duplicate of a medicine the buyer already takes' });
  const o = (await q(`SELECT status, cancellation_reason FROM orders WHERE id = $1`, [a.order.id]))[0];
  const s = await ship(a.own);
  const refunds = await q(`SELECT amount_paise FROM refunds WHERE order_id = $1`, [a.order.id]);
  check('order cancelled with the reason; shipment marked refused by the pharmacist', r.status === 200 && o.status === 'cancelled'
    && /pharmacist's check: Duplicate/.test(o.cancellation_reason) && s.pharmacist_check === 'rejected' && s.status === 'cancelled', { r: r.json, o, s });
  check('the whole amount is refunded', refunds.reduce((n, x) => n + Number(x.amount_paise), 0) === a.order.total_paise, refunds);
  const trail = await audits(a.own);
  check('audit log has the refusal and its reason', trail.some((x) => x.action === 'pharmacist_check_rejected' && /Duplicate/.test(x.notes)), trail);
  r = await pack(a.own);
  check('a refused order cannot be packed', r.status === 409, r.json);
  r = await call('GET', `/orders/${a.order.id}`, { token: t.buyer });
  check('buyer sees the order as refused by the pharmacist', r.json.data?.pharmacist_check === 'rejected', r.json.data?.pharmacist_check);
}

export async function runPartner() {
  console.log('E. A partner shipment waits for the partner\'s own registered pharmacist');
  const a = await paidOrder([{ product_id: P.part, quantity: 2 }]);
  check('the order went to the partner', !!a.partner, a);
  const dispatch = (token = t.partner) => call('POST', `/partner/shipments/${a.partner}/dispatch`, { token,
    body: { courier_partner: 'Shree Courier', awb_number: 'S35PAWB1', seal_number: 'SEAL-S35-P1' } });
  let r = await call('GET', '/partner/shipments?status=pending', { token: t.partner });
  check('the partner sees it as waiting for their pharmacist', r.json.data?.shipments?.find((s) => s.id === a.partner)?.pharmacist_check === 'pending', r.json.data?.shipments);
  r = await dispatch();
  check('partner dispatch is refused with a plain message', r.status === 409 && /Your registered pharmacist must check this shipment/.test(r.json.message), r.json);
  r = await call('GET', '/partner/pharmacists', { token: t.partner });
  check('the partner lists its active registered pharmacists only', r.json.data?.pharmacists?.length === 1 && r.json.data.pharmacists[0].registration_no === 'MSPC-S35-P1', r.json);
  r = await decide(t.pharmacist, a.partner, { decision: 'release' });
  check('Dawabag\'s pharmacist does not release a partner\'s shipment', r.status === 404, r.json);
  const pcheck = (body, token = t.partner) => call('POST', `/partner/shipments/${a.partner}/check`, { token, body });
  r = await pcheck({ decision: 'release', vendor_pharmacist_id: VP.b });
  check('another partner\'s pharmacist cannot be named', r.status === 400, r.json);
  r = await pcheck({ decision: 'release', vendor_pharmacist_id: VP.aOld });
  check('a pharmacist no longer active cannot be named', r.status === 400, r.json);
  r = await pcheck({ decision: 'release', vendor_pharmacist_id: VP.a }, t.partner2);
  check('another partner cannot release it', r.status === 404, r.json);
  r = await pcheck({ decision: 'hold', vendor_pharmacist_id: VP.a, reason: 'Waiting to speak to the buyer' });
  check('the partner\'s pharmacist can hold it', r.status === 200 && r.json.data?.pharmacist_check === 'held', r.json);
  r = await dispatch();
  check('a held partner shipment cannot be dispatched', r.status === 409 && /On hold by the pharmacist/.test(r.json.message), r.json);
  r = await pcheck({ decision: 'release', vendor_pharmacist_id: VP.a });
  const s = await ship(a.partner);
  check('released by the partner\'s pharmacist: name, reg. no. and which pharmacist recorded', r.status === 200 && s.pharmacist_check === 'released'
    && s.pharmacist_name === 'S35 Asha Pharmacist' && s.pharmacist_reg_no === 'MSPC-S35-P1' && s.vendor_pharmacist_id === VP.a && s.pharmacist_checked_by === ids.partner, s);
  const trail = await audits(a.partner);
  check('audit log: partner hold and release, performed by the partner login', trail.map((x) => x.action).join() === 'pharmacist_check_held,pharmacist_check_released'
    && trail.every((x) => x.performed_by === ids.partner) && trail[1].new_value.vendor_pharmacist_id === VP.a, trail);
  r = await dispatch();
  check('now the partner can dispatch', r.status === 200, r.json);
  r = await call('GET', `/orders/${a.order.id}`, { token: t.buyer });
  check('the buyer sees the partner pharmacist\'s name and reg. no.', r.json.data?.shipments?.[0]?.pharmacist_name === 'S35 Asha Pharmacist', r.json.data?.shipments);

  console.log('Partner shipment of an order still waiting for its prescription');
  const b = await paidOrder([{ product_id: P.part, quantity: 1 }]);
  await q(`UPDATE orders SET status = 'rx_pending' WHERE id = $1`, [b.order.id]);
  r = await call('POST', `/partner/shipments/${b.partner}/check`, { token: t.partner, body: { decision: 'release', vendor_pharmacist_id: VP.a } });
  check('the partner waits for Dawabag\'s prescription review first', r.status === 409 && /verify the prescription/.test(r.json.message), r.json);
}

export async function runTrustPage() {
  console.log('F. Trust page says every order is checked (only the untouched seed was replaced)');
  const r = await call('GET', '/info-pages/pharmacist-checked');
  const page = r.json.data?.page ?? r.json.data;
  check('title "Every order is checked by a pharmacist"', page?.title === 'Every order is checked by a pharmacist', page?.title);
  check('the text says every order, with or without prescription medicines', /Every order is checked by a registered pharmacist before it is packed/.test(JSON.stringify(page)), page?.summary);
  const v = await q(`SELECT version FROM info_pages WHERE page_key = 'pharmacist-checked' AND title = 'Every order is checked by a pharmacist'`);
  check('published once (the migration is guarded)', v.length === 1, v);
}
