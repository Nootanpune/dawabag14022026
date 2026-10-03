// Sprint 43 A — the buyer lowers quantities / removes lines before packing (URS-074; C-08,
// C-30, C-31, C-37, C-46). The invoice stays as issued; a credit note covers what comes off;
// stock and partner reservations go back; the money comes back now (paid) or right after
// the capture (authorised only — Razorpay captures the authorised amount in full).
import { createRequire } from 'module';
import { call, check, q } from '../sprint5/lib.mjs';
import { checkoutPayment, razorpay } from '../fakes/razorpay.mjs';
import { P, ids, payment, placeOrder, rxBody, rxOf, shipmentsOf, t } from '../sprint39/fixtures.mjs';

const require = createRequire(import.meta.url);
const { Client } = require('pg');

const pay = async (orderId, status) => {
  const c = await call('POST', '/payments/create-order', { token: t.buyer, body: { order_id: orderId } });
  if (c.status !== 200) throw new Error(`create-order: ${JSON.stringify(c.json)}`);
  const p = checkoutPayment(c.json.data.razorpay_order_id, { status });
  const v = await call('POST', '/payments/verify', { token: t.buyer, body: p });
  if (v.status !== 200) throw new Error(`verify: ${JSON.stringify(v.json)}`);
  return p;
};
const edit = (orderId, lines, token = t.buyer) => call('POST', `/orders/${orderId}/edit`, { token, body: { lines } });
const items = (orderId) => q(`SELECT id, product_id, quantity, removed_qty, supply_qty, line_total_paise, shipment_id FROM order_items WHERE order_id = $1`, [orderId]);
const line = async (orderId, productId) => (await items(orderId)).find((i) => i.product_id === productId);
const refundsOf = (orderId) => q(`SELECT source, method, amount_paise, status FROM refunds WHERE order_id = $1 ORDER BY created_at`, [orderId]);
const reserved = async (productId) => Number((await q(`SELECT COALESCE(SUM(quantity_reserved), 0)::int AS n FROM inventory_batches WHERE product_id = $1`, [productId]))[0].n);
const available = async (productId) => Number((await q(`SELECT COALESCE(SUM(quantity_available), 0)::int AS n FROM inventory_batches WHERE product_id = $1`, [productId]))[0].n);
const partnerReserved = async () => Number((await q(`SELECT COALESCE(SUM(qty_reserved), 0)::int AS n FROM partner_inventory WHERE batch_number = 'S43-PB2'`))[0].n);

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

export async function runOrderEdit() {
  console.log('\nA. Lower or remove before packing — paid order, two sellers');
  const { order } = await placeOrder([{ product_id: P.otc, quantity: 3 }, { product_id: P.feed, quantity: 2 }], { withRx: false });
  let r = await call('GET', `/orders/${order.id}`, { token: t.buyer });
  check('unpaid: the order page says it cannot be changed yet', r.json.data?.can_edit === false && /not paid yet/.test(r.json.data?.edit_block_reason ?? ''), r.json.data?.edit_block_reason);
  r = await edit(order.id, [{ order_item_id: (await line(order.id, P.otc)).id, quantity: 1 }]);
  check('… and POST /orders/:id/edit → 409 ORDER_NOT_EDITABLE', r.status === 409 && r.json.code === 'ORDER_NOT_EDITABLE', r.json);
  const gw = await pay(order.id, 'captured');
  const otc = await line(order.id, P.otc), feed = await line(order.id, P.feed);
  const sh = await shipmentsOf(order.id);
  const invoiceBefore = await q(`SELECT id, invoice_number, total_paise FROM order_shipments WHERE order_id = $1 ORDER BY id`, [order.id]);
  const resOwn = await reserved(P.otc), resPartner = await partnerReserved();
  r = await call('GET', `/orders/${order.id}`, { token: t.buyer });
  check('paid, nothing packed: can_edit true, no changes yet', r.json.data?.can_edit === true && r.json.data?.edits?.length === 0, r.json.data);
  r = await call('GET', `/orders/${order.id}`, { token: t.opsAdmin });
  check('staff see the order but are not offered the buyer\'s change', r.json.data?.can_edit === false);

  r = await edit(order.id, [{ order_item_id: otc.id, quantity: 4 }]);
  check('raising a quantity → 422 ORDER_EDIT_INCREASE_NOT_SUPPORTED ("place a new order")', r.status === 422
    && r.json.code === 'ORDER_EDIT_INCREASE_NOT_SUPPORTED' && /new order/.test(r.json.message), r.json);
  r = await edit(order.id, [{ order_item_id: otc.id, quantity: 0 }, { order_item_id: feed.id, quantity: 0 }]);
  check('removing everything → 409 ORDER_EDIT_WOULD_EMPTY (cancel instead)', r.status === 409 && r.json.code === 'ORDER_EDIT_WOULD_EMPTY', r.json);
  r = await edit(order.id, [{ order_item_id: otc.id, quantity: 1 }], t.other);
  check('another buyer cannot change it → 404', r.status === 404, r.json);
  r = await edit(order.id, [{ order_item_id: otc.id, quantity: 1 }], t.pharmacist);
  check('staff cannot use the buyer\'s change → 403', r.status === 403, r.json);

  r = await edit(order.id, [{ order_item_id: otc.id, quantity: 1 }, { order_item_id: feed.id, quantity: 0 }]);
  const expected = Math.round(otc.line_total_paise * 2 / 3) + feed.line_total_paise;
  check('lower 3 → 1 and remove the partner\'s line: refunded now, two credit notes', r.status === 200 && r.json.data?.refund_status === 'recorded'
    && r.json.data.credit_notes?.length === 2 && Math.abs(r.json.data.refund_paise - expected) <= 1 && /refunded/.test(r.json.data.message), { got: r.json, expected });
  const after = { otc: await line(order.id, P.otc), feed: await line(order.id, P.feed) };
  check('lines: invoiced quantity kept, removed_qty grows, supply_qty is what is left', after.otc.quantity === 3 && after.otc.removed_qty === 2
    && after.otc.supply_qty === 1 && after.feed.removed_qty === 2 && after.feed.supply_qty === 0, after);
  const invoiceAfter = await q(`SELECT id, invoice_number, total_paise FROM order_shipments WHERE order_id = $1 ORDER BY id`, [order.id]);
  check('the tax invoices are unchanged (number and amounts, C-30)', JSON.stringify(invoiceAfter) === JSON.stringify(invoiceBefore));
  const notes = await q(`SELECT n.credit_note_number, n.reason, n.shipment_id, n.total_paise FROM credit_notes n WHERE n.order_id = $1`, [order.id]);
  check('credit notes in each seller\'s series, reason order_edit', notes.length === 2 && notes.every((n) => n.reason === 'order_edit')
    && notes.some((n) => n.shipment_id === sh.own) && notes.some((n) => n.shipment_id === sh.partner), notes);
  check('Dawabag\'s reserved stock back by 2', (await reserved(P.otc)) === resOwn - 2, { before: resOwn, now: await reserved(P.otc) });
  check('the partner\'s reservation back by 2 (its own ledger)', (await partnerReserved()) === resPartner - 2, { before: resPartner, now: await partnerReserved() });
  const ps = (await q(`SELECT status FROM order_shipments WHERE id = $1`, [sh.partner]))[0];
  const poi = (await q(`SELECT dispatch_status, allocated_qty, line_value_paise FROM partner_order_items WHERE order_id = $1`, [order.id]))[0];
  check('the partner\'s parcel is not made at all (shipment and partner line cancelled)', ps.status === 'cancelled'
    && poi.dispatch_status === 'cancelled' && poi.allocated_qty === 0 && poi.line_value_paise === 0, { ps, poi });
  const rf = await refundsOf(order.id);
  check('refund to the card / UPI through the ledger (source order_edit), settled at the gateway', rf.length === 1 && rf[0].source === 'order_edit'
    && rf[0].method === 'gateway' && rf[0].status === 'processed'
    && razorpay.refunds.some((x) => x.payment_id === gw.razorpay_payment_id && x.amount === rf[0].amount_paise), { rf, gw: razorpay.refunds.slice(-2) });
  r = await call('GET', `/orders/${order.id}`, { token: t.buyer });
  const e0 = r.json.data?.edits?.[0];
  check('the order page lists the change, its credit notes and refund', r.json.data?.edits?.length === 1 && e0.lines.length === 2
    && e0.lines.some((l) => l.from_qty === 3 && l.to_qty === 1) && e0.refund_status === 'recorded'
    && r.json.data.credit_notes.length === 2 && r.json.data.refunds.some((x) => x.source === 'order_edit'), r.json.data?.edits);
  check('audit: order_edited with the lines and credit notes (C-46)', (await q(
    `SELECT 1 FROM audit_logs WHERE action = 'order_edited' AND new_value->>'order_id' = $1`, [order.id])).length === 1);
  r = await call('GET', `/invoices/credit-notes/${(await q(`SELECT id FROM credit_notes WHERE order_id = $1 AND shipment_id = $2`, [order.id, sh.own]))[0].id}.pdf`, { token: t.buyer, raw: true });
  check('the buyer can download the credit note', r.status === 200, r.status);

  // The database keeps it honest (as the API's own login, Sprint 41)
  const api = await apiLogin();
  if (api) {
    try {
      let e = await refused(api, `UPDATE order_items SET removed_qty = 0 WHERE id = $1`, [after.otc.id]);
      check('database: a removed quantity cannot be put back', e?.code === 'P0001' && /cannot be put back/.test(e.message), e);
      e = await refused(api, `UPDATE order_items SET removed_qty = 5 WHERE id = $1`, [after.otc.id]);
      check('database: never more than was invoiced', e?.code === '23514', e);
      e = await refused(api, `UPDATE order_edits SET refund_paise = 1 WHERE order_id = $1`, [order.id]);
      check('database: an order change is final (only its refund status moves on)', e?.code === 'P0001', e);
      e = await refused(api, `DELETE FROM order_edits WHERE order_id = $1`, [order.id]);
      check('database: order changes cannot be deleted', e?.code === 'P0001', e);
    } finally { await api.end(); }
  }

  // The pack list shows what is left; after packing the order is closed to changes
  r = await call('GET', '/fulfilment/queue?stage=pack', { token: t.packer });
  const card = (r.json.data?.items ?? []).find((s) => s.shipment_id === sh.own);
  check('pack list: only the 1 unit left', card?.lines?.length === 1 && card.lines[0].quantity === 1, card);
  r = await call('POST', `/fulfilment/shipments/${sh.own}/check`, { token: t.pharmacist, body: { decision: 'release' } });
  check('pharmacist releases what is left (less never needs a new check)', r.status === 200, r.json);
  r = await call('POST', `/fulfilment/shipments/${sh.own}/pack`, { token: t.packer });
  check('packed', r.status === 200, r.json);
  r = await edit(order.id, [{ order_item_id: otc.id, quantity: 0 }, { order_item_id: feed.id, quantity: 0 }]);
  check('once packing started: 409 ORDER_NOT_EDITABLE', r.status === 409 && r.json.code === 'ORDER_NOT_EDITABLE' && /Packing has started/.test(r.json.message), r.json);
  const avail = await available(P.otc);
  r = await call('POST', `/fulfilment/shipments/${sh.own}/dispatch`, { token: t.packer, body: { courier_partner: 'Delhivery', awb_number: 'S43AWB1', seal_number: 'SEAL-S43-1' } });
  check('dispatch takes only the 1 unit out of stock', r.status === 200 && (await available(P.otc)) === avail - 1, { r: r.json, before: avail, now: await available(P.otc) });

  console.log('\nCancelling after a change: credit note and refund for what is left only');
  const two = await placeOrder([{ product_id: P.otc, quantity: 4 }], { withRx: false });
  await pay(two.order.id, 'captured');
  const l2 = await line(two.order.id, P.otc);
  r = await edit(two.order.id, [{ order_item_id: l2.id, quantity: 1 }]);
  check('lowered 4 → 1', r.status === 200 && r.json.data.refund_status === 'recorded', r.json);
  r = await call('POST', `/orders/${two.order.id}/cancel`, { token: t.buyer, body: { reason: 'S43 test: no longer needed' } });
  const cn = await q(`SELECT ci.quantity FROM credit_note_items ci JOIN credit_notes n ON n.id = ci.credit_note_id WHERE n.order_id = $1 ORDER BY n.created_at`, [two.order.id]);
  const totalRefund = (await refundsOf(two.order.id)).reduce((s, x) => s + x.amount_paise, 0);
  check('cancel credits only the unit left (3 + 1 = 4, never more than invoiced)', r.status === 200 && cn.map((x) => x.quantity).join(',') === '3,1', { r: r.json, cn });
  check('… and everything paid comes back exactly once', totalRefund === Number(two.order.total_paise), { totalRefund, total: two.order.total_paise });
  check('… reservations fully given back', (await q(`SELECT 1 FROM inventory_batches WHERE product_id = $1 AND quantity_reserved < 0`, [P.otc])).length === 0);

  await runHeldPayment();
}

async function runHeldPayment() {
  console.log('\nAuthorised only (prescription order): refund straight after the capture');
  const { order } = await placeOrder([{ product_id: P.rx, quantity: 2 }, { product_id: P.otc, quantity: 2 }]);
  const gw = await pay(order.id, 'authorized');
  check('payment held (authorized)', (await payment(order.id))?.status === 'authorized');
  const otc = await line(order.id, P.otc);
  let r = await edit(order.id, [{ order_item_id: otc.id, quantity: 0 }]);
  check('remove the OTC line while held → refund after capture, nothing charged yet', r.status === 200 && r.json.data?.refund_status === 'after_capture'
    && r.json.data.refund_paise === otc.line_total_paise && /held amount is taken after/.test(r.json.data.message) && (await refundsOf(order.id)).length === 0, r.json);
  check('… the payment is still only held', (await payment(order.id))?.status === 'authorized' && razorpay.payments.get(gw.razorpay_payment_id)?.status === 'authorized');
  const rx = await rxOf(order.id);
  r = await call('POST', `/fulfilment/prescriptions/${rx}/verify`, { token: t.pharmacist, body: rxBody(P.rx, 2) });
  check('pharmacist verifies → the authorised amount is captured in full', r.status === 200 && razorpay.payments.get(gw.razorpay_payment_id)?.status === 'captured', r.json);
  const rf = await refundsOf(order.id);
  check('… and the removed line is refunded right after (source order_edit)', rf.length === 1 && rf[0].source === 'order_edit'
    && rf[0].amount_paise === otc.line_total_paise && rf[0].status === 'processed', rf);
  check('… the change now shows the refund recorded', (await q(`SELECT refund_status FROM order_edits WHERE order_id = $1`, [order.id]))[0]?.refund_status === 'recorded');

  console.log('\nRemoving the only prescription line: no prescription check needed any more');
  const b = await placeOrder([{ product_id: P.rx, quantity: 1 }, { product_id: P.otc, quantity: 1 }]);
  const gwB = await pay(b.order.id, 'authorized');
  r = await edit(b.order.id, [{ order_item_id: (await line(b.order.id, P.rx)).id, quantity: 0 }]);
  const ob = (await q(`SELECT status FROM orders WHERE id = $1`, [b.order.id]))[0];
  check('order moves from waiting for the prescription to packing; held payment captured; refund recorded', r.status === 200
    && ob.status === 'packing' && razorpay.payments.get(gwB.razorpay_payment_id)?.status === 'captured'
    && (await refundsOf(b.order.id)).some((x) => x.source === 'order_edit'), { r: r.json, ob });
  r = await call('POST', `/fulfilment/shipments/${(await shipmentsOf(b.order.id)).own}/check`, { token: t.pharmacist, body: { decision: 'release' } });
  check('… the pharmacist still checks the OTC parcel before packing (C-08)', r.status === 200, r.json);

  console.log('\nHeld, changed, then cancelled: nothing charged, no refund needed');
  const c = await placeOrder([{ product_id: P.rx, quantity: 1 }, { product_id: P.otc, quantity: 2 }]);
  await pay(c.order.id, 'authorized');
  r = await edit(c.order.id, [{ order_item_id: (await line(c.order.id, P.otc)).id, quantity: 1 }]);
  check('lowered while held', r.status === 200 && r.json.data.refund_status === 'after_capture', r.json);
  r = await call('POST', `/orders/${c.order.id}/cancel`, { token: t.buyer, body: { reason: 'S43 test: changed my mind' } });
  check('cancelled: the hold is released, no refund rows, the change marked not needed', r.status === 200 && r.json.data?.released_paise > 0
    && (await refundsOf(c.order.id)).length === 0
    && (await q(`SELECT refund_status FROM order_edits WHERE order_id = $1`, [c.order.id]))[0]?.refund_status === 'not_needed', r.json);
  void ids;
}
