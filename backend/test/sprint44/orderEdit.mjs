// Sprint 44 A — changing an order before the pharmacist's approval (owner decision CONFIRMED
// 2026-10-03): raise and add (OTC and prescription), allocation again (another seller → another
// shipment), a prescription for new prescription medicines and back to the pharmacist's check
// (C-08), the difference paid by a second payment that must be made (authorised for a
// prescription order) before the pharmacist can approve, no change once the invoice is issued.
import { call, check, q } from '../sprint5/lib.mjs';
import { checkoutPayment, razorpay } from '../fakes/razorpay.mjs';
import { P, V, payment, placeOrder, rxBody, rxOf, shipmentsOf, t, uploadedRx } from '../sprint39/fixtures.mjs';

const pay = async (orderId, status, orderEditId) => {
  const c = await call('POST', '/payments/create-order', { token: t.buyer, body: { order_id: orderId, ...(orderEditId ? { order_edit_id: orderEditId } : {}) } });
  if (c.status !== 200) throw new Error(`create-order: ${JSON.stringify(c.json)}`);
  const p = checkoutPayment(c.json.data.razorpay_order_id, { status });
  const v = await call('POST', '/payments/verify', { token: t.buyer, body: p });
  if (v.status !== 200) throw new Error(`verify: ${JSON.stringify(v.json)}`);
  return { c: c.json.data, p, v: v.json.data };
};
const edit = (orderId, body, token = t.buyer) => call('POST', `/orders/${orderId}/edit`, { token, body });
const lines = (orderId) => q(`SELECT oi.id, oi.product_id, oi.quantity, oi.line_total_paise, oi.shipment_id, s.seller_type
                              FROM order_items oi JOIN order_shipments s ON s.id = oi.shipment_id WHERE oi.order_id = $1`, [orderId]);
const lineOf = async (orderId, productId) => (await lines(orderId)).find((l) => l.product_id === productId);
const orderRow = async (id) => (await q(`SELECT status, subtotal_paise, gst_paise, discount_paise, shipping_paise, total_paise FROM orders WHERE id = $1`, [id]))[0];
const editRow = async (id) => (await q(`SELECT * FROM order_edits WHERE id = $1`, [id]))[0];
const value = (o) => Number(o.subtotal_paise) + Number(o.gst_paise) + Number(o.shipping_paise) - Number(o.discount_paise);
const release = (shipmentId, token = t.pharmacist) => call('POST', `/fulfilment/shipments/${shipmentId}/check`, { token, body: { decision: 'release' } });
const partnerRelease = (shipmentId) => call('POST', `/partner/shipments/${shipmentId}/check`, { token: t.partner, body: { decision: 'release', vendor_pharmacist_id: V.pharmacist } });

export async function runOrderEdit() {
  console.log('\nA1. Raise and add (OTC) before approval: allocated again, the difference paid before approval');
  const { order } = await placeOrder([{ product_id: P.otc, quantity: 2 }], { withRx: false });
  await pay(order.id, 'captured');
  const otc = await lineOf(order.id, P.otc);
  const before = await orderRow(order.id);
  let r = await call('GET', `/orders/${order.id}`, { token: t.buyer });
  check('paid, not yet approved: may be changed; no invoice yet', r.json.data?.can_edit === true && !r.json.data.invoice_number
    && r.json.data.shipments.every((s) => !s.invoice_number), r.json.data?.edit_block_reason);

  r = await edit(order.id, { lines: [{ order_item_id: otc.id, quantity: 3 }], add: [{ product_id: P.feed, quantity: 1 }] });
  const after = await orderRow(order.id);
  const diff = value(after) - value(before);
  check('raise 2 → 3 and add a medicine: accepted, the difference is to be paid (second payment)', r.status === 200
    && r.json.data?.extra_status === 'awaiting_payment' && r.json.data.extra_paise === diff && diff > 0
    && r.json.data.extra_payment?.order_edit_id === r.json.data.id && r.json.data.extra_payment.capture === 'now'
    && /pay the difference/.test(r.json.data.message), { r: r.json, diff });
  const editId = r.json.data?.id;
  const ls = await lines(order.id);
  check('the raised unit came from the same batch: the line is now 3 (re-priced, no new line)', ls.filter((l) => l.product_id === P.otc).length === 1
    && (await lineOf(order.id, P.otc)).quantity === 3, ls);
  const sh = await shipmentsOf(order.id);
  check('the added medicine is held only by the partner: a new partner shipment, not invoiced', !!sh.partner
    && (await lineOf(order.id, P.feed))?.seller_type === 'partner'
    && !(await q(`SELECT invoice_number FROM order_shipments WHERE id = $1`, [sh.partner]))[0].invoice_number, sh);
  const ship = await q(`SELECT seller_type, total_paise FROM order_shipments WHERE order_id = $1 AND status <> 'cancelled'`, [order.id]);
  check('shipment amounts follow the lines (sum = the order\'s goods)', ship.reduce((s, x) => s + Number(x.total_paise), 0)
    === Number(after.subtotal_paise) + Number(after.gst_paise), { ship, after });
  check('no credit note (nothing was invoiced)', (await q(`SELECT 1 FROM credit_notes WHERE order_id = $1`, [order.id])).length === 0);
  r = await call('GET', `/orders/${order.id}`, { token: t.buyer });
  check('the order page asks for the difference', r.json.data?.extra_payment?.order_edit_id === editId && r.json.data.extra_payment.amount_paise === diff, r.json.data?.extra_payment);

  r = await release(sh.own);
  check('the pharmacist cannot approve while the difference is unpaid → 409 EXTRA_PAYMENT_PENDING', r.status === 409 && r.json.code === 'EXTRA_PAYMENT_PENDING', r.json);
  r = await partnerRelease(sh.partner);
  check('… nor the partner\'s pharmacist', r.status === 409 && r.json.code === 'EXTRA_PAYMENT_PENDING', r.json);
  r = await call('GET', '/fulfilment/queue?stage=check', { token: t.pharmacist });
  const card = (r.json.data?.items ?? r.json.data ?? []).find?.((x) => x.shipment_id === sh.own);
  check('the pharmacist\'s queue says the difference is not paid yet', card?.extra_payment_pending === true, card);

  const second = await pay(order.id, 'captured', editId);
  check('the difference: a Razorpay order for exactly that amount, captured (automatic: no prescription line)', second.c.amount === diff
    && second.c.capture === 'now' && second.v.payment_status === 'captured' && second.v.order_edit_id === editId, second);
  check('the change is paid', (await editRow(editId)).extra_status === 'paid');
  r = await call('POST', '/payments/create-order', { token: t.buyer, body: { order_id: order.id, order_edit_id: editId } });
  check('paying it again is refused (nothing waiting)', r.status === 409, r.json);

  r = await edit(order.id, { lines: [{ order_item_id: otc.id, quantity: 2 }] });
  check('lower again after paying: refunded now (the second payment counts as paid)', r.status === 200 && r.json.data.refund_status === 'recorded'
    && r.json.data.refund_paise > 0, r.json);

  r = await release(sh.own);
  const own = (await q(`SELECT invoice_number, invoice_issued_at, total_paise FROM order_shipments WHERE id = $1`, [sh.own]))[0];
  check('paid: the pharmacist approves Dawabag\'s part → its invoice is issued now', r.status === 200 && /^DWB\//.test(own.invoice_number ?? '')
    && !!own.invoice_issued_at, { r: r.json, own });
  r = await partnerRelease(sh.partner);
  const pt = (await q(`SELECT invoice_number FROM order_shipments WHERE id = $1`, [sh.partner]))[0];
  check('… and the partner\'s pharmacist its part, in the partner\'s own series', r.status === 200 && /^S39A\//.test(pt.invoice_number ?? ''), { r: r.json, pt });
  r = await edit(order.id, { add: [{ product_id: P.rx, quantity: 1 }] });
  check('after the approval / invoice: 409 ORDER_NOT_EDITABLE with the plain reason', r.status === 409 && r.json.code === 'ORDER_NOT_EDITABLE'
    && r.json.message === 'The invoice has been issued; you can cancel or return instead.', r.json);
  const money = (await q(`SELECT COALESCE(SUM(amount_paise), 0)::int AS paid FROM payments WHERE order_id = $1
                          AND status IN ('captured', 'partially_refunded', 'refunded')`, [order.id]))[0].paid
    - (await q(`SELECT COALESCE(SUM(amount_paise), 0)::int AS back FROM refunds WHERE order_id = $1`, [order.id]))[0].back;
  const fin = await orderRow(order.id);
  check('money adds up: paid − refunded = the order\'s value now = the invoices + delivery − discount', money === value(fin)
    && money === Number(own.total_paise) + (await q(`SELECT total_paise FROM order_shipments WHERE id = $1`, [sh.partner]))[0].total_paise
      + Number(fin.shipping_paise) - Number(fin.discount_paise), { money, value: value(fin) });

  console.log('\nA2. Add a prescription medicine: a valid prescription, back to the pharmacist\'s check, the difference held');
  const b = await placeOrder([{ product_id: P.otc, quantity: 1 }], { withRx: false });
  await pay(b.order.id, 'captured');
  r = await edit(b.order.id, { add: [{ product_id: P.rx, quantity: 2 }] });
  check('without a prescription → 422 PRESCRIPTION_REQUIRED, nothing changed', r.status === 422 && r.json.code === 'PRESCRIPTION_REQUIRED'
    && (await lines(b.order.id)).length === 1, r.json);
  r = await edit(b.order.id, { add: [{ product_id: P.rx, quantity: 2 }], prescription_id: await uploadedRx() });
  const bo = await orderRow(b.order.id);
  const bEdit = r.json.data?.id;
  check('with an uploaded prescription → accepted; the order goes back to the pharmacist\'s prescription check', r.status === 200
    && bo.status === 'rx_pending' && r.json.data.sent_to_pharmacist === true && r.json.data.prescription?.how === 'attached', { r: r.json, bo });
  check('… the difference is to be paid and will only be held (prescription order)', r.json.data?.extra_payment?.capture === 'after_pharmacist_check', r.json.data?.extra_payment);
  const rxId = await rxOf(b.order.id);
  r = await call('POST', `/fulfilment/prescriptions/${rxId}/verify`, { token: t.pharmacist, body: rxBody(P.rx, 2) });
  check('the pharmacist cannot verify (approve) before the difference is authorised → 409', r.status === 409 && r.json.code === 'EXTRA_PAYMENT_PENDING', r.json);
  const held = await pay(b.order.id, 'authorized', bEdit);
  check('the difference is authorised, not charged', held.v.payment_status === 'authorized' && (await editRow(bEdit)).extra_status === 'authorised'
    && razorpay.payments.get(held.p.razorpay_payment_id)?.status === 'authorized', held.v);
  r = await call('POST', `/fulfilment/prescriptions/${rxId}/verify`, { token: t.pharmacist, body: rxBody(P.rx, 2) });
  const bs = (await q(`SELECT invoice_number, pharmacist_check FROM order_shipments WHERE order_id = $1 AND seller_type = 'dawabag'`, [b.order.id]))[0];
  check('verified (the check): the shipment is released and invoiced; the held difference is captured', r.status === 200
    && bs.pharmacist_check === 'released' && /^DWB\//.test(bs.invoice_number ?? '')
    && razorpay.payments.get(held.p.razorpay_payment_id)?.status === 'captured' && (await editRow(bEdit)).extra_status === 'paid', { r: r.json, bs });

  console.log('\nA3. A later change replaces an unpaid difference');
  const c = await placeOrder([{ product_id: P.otc, quantity: 1 }], { withRx: false });
  await pay(c.order.id, 'captured');
  const cl = await lineOf(c.order.id, P.otc);
  r = await edit(c.order.id, { lines: [{ order_item_id: cl.id, quantity: 4 }] });
  const first = r.json.data;
  const stale = await call('POST', '/payments/create-order', { token: t.buyer, body: { order_id: c.order.id, order_edit_id: first.id } });
  r = await edit(c.order.id, { lines: [{ order_item_id: cl.id, quantity: 2 }] });
  check('raise 1 → 4 (difference due), then 4 → 2: the first difference is replaced by the smaller one', first.extra_status === 'awaiting_payment'
    && r.status === 200 && r.json.data.extra_status === 'awaiting_payment' && r.json.data.extra_paise < first.extra_paise
    && (await editRow(first.id)).extra_status === 'superseded', { first, second: r.json.data });
  r = await call('POST', '/payments/create-order', { token: t.buyer, body: { order_id: c.order.id, order_edit_id: first.id } });
  check('the replaced change cannot be paid any more', r.status === 409 && r.json.code === 'NOTHING_TO_PAY', r.json);
  // A payment started for it before it was replaced, and completed late: straight back (C-37)
  const late = checkoutPayment(stale.json.data.razorpay_order_id, { status: 'captured' });
  r = await call('POST', '/payments/verify', { token: t.buyer, body: late });
  check('a late payment for a replaced change is refunded at once, to that same payment', r.status === 409
    && (await q(`SELECT 1 FROM refunds WHERE order_id = $1 AND source = 'order_edit' AND amount_paise = $2 AND gateway_payment_id = $3`,
      [c.order.id, first.extra_paise, late.razorpay_payment_id])).length === 1, r.json);
  r = await call('POST', `/orders/${c.order.id}/cancel`, { token: t.buyer, body: { reason: 'S44 test: not needed' } });
  check('cancelled with a difference unpaid: the change is closed (nothing owed), no credit note', r.status === 200
    && (await q(`SELECT extra_status FROM order_edits WHERE order_id = $1 ORDER BY edited_at DESC LIMIT 1`, [c.order.id]))[0].extra_status === 'cancelled'
    && r.json.data.credit_notes.length === 0, r.json);

  console.log('\nA4. A prescription order (payment held): raise the prescription medicine with the prescription sent with it');
  const d = await placeOrder([{ product_id: P.rx, quantity: 1 }]);
  const main = await pay(d.order.id, 'authorized');
  const dl = await lineOf(d.order.id, P.rx);
  r = await edit(d.order.id, { lines: [{ order_item_id: dl.id, quantity: 3 }] });
  check('raising a prescription medicine without naming the prescription → 422 PRESCRIPTION_REQUIRED', r.status === 422 && r.json.code === 'PRESCRIPTION_REQUIRED', r.json);
  const dRx = await rxOf(d.order.id);
  r = await edit(d.order.id, { lines: [{ order_item_id: dl.id, quantity: 3 }], prescription_id: dRx });
  check('… naming the prescription already with the order (not yet checked) → accepted, difference held', r.status === 200
    && r.json.data.prescription?.how === 'with_order' && r.json.data.extra_payment?.capture === 'after_pharmacist_check', r.json);
  const dExtra = await pay(d.order.id, 'authorized', r.json.data.id);
  r = await call('POST', `/fulfilment/prescriptions/${dRx}/verify`, { token: t.pharmacist, body: rxBody(P.rx, 3) });
  check('verified: both authorisations are captured (the order\'s and the difference)', r.status === 200
    && razorpay.payments.get(main.p.razorpay_payment_id)?.status === 'captured' && razorpay.payments.get(dExtra.p.razorpay_payment_id)?.status === 'captured'
    && (await payment(d.order.id))?.status === 'captured', r.json);
  r = await edit(d.order.id, { lines: [{ order_item_id: dl.id, quantity: 1 }] });
  check('after the prescription check and approval: no more changes', r.status === 409 && r.json.code === 'ORDER_NOT_EDITABLE', r.json);
}
