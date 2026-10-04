// Sprint 48 A — security review of Sprints 41–47: money and approval races around order changes.
//   A1 (#1) one order change paid by two gateway payments: the second authorisation is released,
//       and a later lowering change + the capture leave the buyer paying exactly the order's value
//   A2 (#2) the pharmacist's approval and the prescription review take the ORDER lock first (the
//       lock an order change takes), and an approval of an order changed since it was shown → 409
//   A3 (#3) the buyer's standing is checked again at the approval (the moment of sale)
//   A4 (#7) a credit order whose bill is paid cannot be made larger
import { call, check, q } from '../sprint5/lib.mjs';
import { checkoutPayment } from '../fakes/razorpay.mjs';
import { P, PIN, V, addr, ids, newProduct, people, permit, placeOrder, plainClient, rxBody, rxOf, shipmentsOf, t } from '../sprint39/fixtures.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const edit = (orderId, body) => call('POST', `/orders/${orderId}/edit`, { token: t.buyer, body });
const lineOf = async (orderId, productId) => (await q(`SELECT id, supply_qty FROM order_items WHERE order_id = $1 AND product_id = $2 AND supply_qty > 0`, [orderId, productId]))[0];
const value = (o) => Number(o.subtotal_paise) + Number(o.gst_paise) + Number(o.shipping_paise) - Number(o.discount_paise);
const orderMoney = async (id) => (await q(`SELECT subtotal_paise, gst_paise, discount_paise, shipping_paise FROM orders WHERE id = $1`, [id]))[0];
async function pay(orderId, status, orderEditId, token = t.buyer) {
  const c = await call('POST', '/payments/create-order', { token, body: { order_id: orderId, ...(orderEditId ? { order_edit_id: orderEditId } : {}) } });
  if (c.status !== 200) throw new Error(`create-order: ${JSON.stringify(c.json)}`);
  return { c: c.json.data, p: checkoutPayment(c.json.data.razorpay_order_id, { status }) };
}
const verify = (p, token = t.buyer) => call('POST', '/payments/verify', { token, body: p });
const netPaid = async (orderId) => (await q(`SELECT COALESCE(SUM(amount_paise), 0)::int AS n FROM payments WHERE order_id = $1
                                              AND status IN ('captured', 'partially_refunded', 'refunded')`, [orderId]))[0].n
  - (await q(`SELECT COALESCE(SUM(amount_paise), 0)::int AS n FROM refunds WHERE order_id = $1 AND status <> 'failed'`, [orderId]))[0].n;

/** Holds the order row lock in another session while `fire` runs; true when `fire` waited for it. */
async function waitsForOrderLock(orderId, fire) {
  const c = await plainClient();
  try {
    await c.query('BEGIN');
    await c.query('SELECT 1 FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
    let done = false;
    const p = fire().then((r) => { done = true; return r; });
    await sleep(900);
    const waited = !done;
    await c.query('COMMIT');
    return { waited, r: await p };
  } finally { await c.end(); }
}

export async function runMoney() {
  console.log('\nA1. One order change, two gateway payments (#1): paid once, money adds up');
  const { order } = await placeOrder([{ product_id: P.rx, quantity: 1 }]);
  const main = await pay(order.id, 'authorized');
  await verify(main.p);
  let r = await edit(order.id, { add: [{ product_id: P.otc, quantity: 2 }] });
  const e1 = r.json.data;
  check('a change adds a medicine: the difference is due, held only (prescription order)', r.status === 200 && e1?.extra_status === 'awaiting_payment'
    && e1.extra_payment?.capture === 'after_pharmacist_check', r.json);
  // Two tabs: two gateway orders for the same change, both completed
  const a = await pay(order.id, 'authorized', e1.id);
  const b = await pay(order.id, 'authorized', e1.id);
  r = await verify(a.p);
  check('the first payment for the change is authorised', r.status === 200 && r.json.data?.payment_status === 'authorized', r.json);
  r = await verify(b.p);
  const second = (await q(`SELECT status, release_reason FROM payments WHERE gateway_order_id = $1`, [b.c.razorpay_order_id]))[0];
  check('the second payment for the same change is NOT accepted: released at once (409), never captured', r.status === 409
    && second.status === 'released', { r: r.json, second });
  const otcLine = await lineOf(order.id, P.otc);
  r = await edit(order.id, { lines: [{ order_item_id: otcLine.id, quantity: 0 }] });
  check('the buyer then removes the added medicine: refunded right after the capture (only one change payment counted)', r.status === 200
    && r.json.data.refund_status === 'after_capture' && r.json.data.refund_paise === e1.extra_paise, { r: r.json, extra: e1.extra_paise });
  const rxId = await rxOf(order.id);
  r = await call('POST', `/fulfilment/prescriptions/${rxId}/verify`, { token: t.pharmacist, body: rxBody(P.rx, 1) });
  check('the pharmacist verifies the prescription: released, holds captured', r.status === 200, r.json);
  const money = await netPaid(order.id);
  const v = value(await orderMoney(order.id));
  check('money adds up: captured − refunded = the order\'s value (no double refund, nothing charged twice)', money === v, { money, value: v });
  check('the released second payment was never captured', (await q(`SELECT status FROM payments WHERE gateway_order_id = $1`, [b.c.razorpay_order_id]))[0].status === 'released');

  console.log('\nA2. Approvals take the order lock; an order changed since it was shown is not approved (#2)');
  const o2 = (await placeOrder([{ product_id: P.otc, quantity: 3 }], { withRx: false })).order;
  await verify((await pay(o2.id, 'captured')).p);
  const own2 = (await shipmentsOf(o2.id)).own;
  r = await call('GET', '/fulfilment/queue?stage=check', { token: t.pharmacist });
  const card = (r.json.data?.items ?? r.json.data ?? []).find?.((x) => x.shipment_id === own2);
  check('the check queue says how many changes the buyer made (0)', card?.edits_count === 0, card);
  r = await edit(o2.id, { lines: [{ order_item_id: (await lineOf(o2.id, P.otc)).id, quantity: 2 }] });
  check('the buyer lowers a quantity while the order waits for the check', r.status === 200, r.json);
  r = await call('POST', `/fulfilment/shipments/${own2}/check`, { token: t.pharmacist, body: { decision: 'release', edits_seen: 0 } });
  check('approving what the screen showed before the change → 409 ORDER_CHANGED, nothing invoiced', r.status === 409 && r.json.code === 'ORDER_CHANGED'
    && !(await q(`SELECT invoice_number FROM order_shipments WHERE id = $1`, [own2]))[0].invoice_number, r.json);
  r = await call('GET', `/fulfilment/checks/${o2.id}`, { token: t.pharmacist });
  check('the order\'s check page shows the change count (1)', r.json.data?.edits_count === 1, r.json.data?.edits_count);
  const locked = await waitsForOrderLock(o2.id, () => call('POST', `/fulfilment/shipments/${own2}/check`, { token: t.pharmacist, body: { decision: 'release', edits_seen: 1 } }));
  check('Dawabag\'s approval waits for the order lock (an order change in progress), then approves the current order', locked.waited
    && locked.r.status === 200 && !!locked.r.json.data?.invoice_number, { waited: locked.waited, r: locked.r.json });

  const o3 = (await placeOrder([{ product_id: P.h1p, quantity: 1 }])).order;
  await verify((await pay(o3.id, 'authorized')).p);
  const rx3 = await rxOf(o3.id);
  const lockedRx = await waitsForOrderLock(o3.id, () => call('POST', `/fulfilment/prescriptions/${rx3}/verify`, { token: t.pharmacist, body: rxBody(P.h1p, 1) }));
  check('the prescription review waits for the order lock too', lockedRx.waited && lockedRx.r.status === 200, { waited: lockedRx.waited, r: lockedRx.r.json });
  const ps3 = (await shipmentsOf(o3.id)).partner;
  r = await call('GET', '/partner/shipments', { token: t.partner });
  const pcard = (r.json.data?.shipments ?? r.json.data ?? []).find?.((x) => x.id === ps3);
  check('the partner\'s shipment list says how many changes the buyer made', pcard?.edits_count === 0, pcard && { edits_count: pcard.edits_count });
  const lockedP = await waitsForOrderLock(o3.id, () => call('POST', `/partner/shipments/${ps3}/check`, { token: t.partner,
    body: { decision: 'release', vendor_pharmacist_id: V.pharmacist, edits_seen: 0 } }));
  check('the partner\'s approval waits for the order lock as well', lockedP.waited && lockedP.r.status === 200, { waited: lockedP.waited, r: lockedP.r.json });

  console.log('\nA3. The buyer\'s standing is checked again at the approval — the moment of sale (#3)');
  const late = (await newProduct('S39-S48LATE')).id;
  await permit([late]);
  await q(`INSERT INTO inventory_batches (product_id, batch_number, quantity_available, purchase_price_paise, expiry_date)
           VALUES ($1, 'S48-B1', 50, 5000, CURRENT_DATE + 400)`, [late]);
  const o4 = (await placeOrder([{ product_id: late, quantity: 1 }], { withRx: false })).order;
  await verify((await pay(o4.id, 'captured')).p);
  // A pharmacist restricts the product to licensed trade buyers after the consumer ordered it
  await q(`UPDATE products SET buyer_restriction = 'trade_only', buyer_restriction_reason = 'S48 test: hospital supply only',
             buyer_restriction_set_by = $2, buyer_restriction_set_at = NOW() WHERE id = $1`, [late, ids.pharmacist]);
  const own4 = (await shipmentsOf(o4.id)).own;
  r = await call('POST', `/fulfilment/shipments/${own4}/check`, { token: t.pharmacist, body: { decision: 'release' } });
  check('a product restricted after the order was placed → the approval is refused (409 BUYER_NOT_ELIGIBLE), nothing invoiced',
    r.status === 409 && r.json.code === 'BUYER_NOT_ELIGIBLE' && !(await q(`SELECT invoice_number FROM order_shipments WHERE id = $1`, [own4]))[0].invoice_number, r.json);
  r = await call('POST', `/fulfilment/shipments/${own4}/check`, { token: t.pharmacist, body: { decision: 'reject', reason: 'S48 test: buyer may not buy it' } });
  check('… the pharmacist refuses it instead: cancelled and refunded', r.status === 200 && r.json.data?.order_status === 'cancelled', r.json);

  // A doctor whose registration is suspended between the order and the approval
  await q(`UPDATE users SET nmc_status = 'verified', nmc_valid_till = CURRENT_DATE + 365, nmc_verified_at = NOW(), nmc_reg_number = 'MMC-S44-01',
             nmc_council_state = 'Maharashtra Medical Council', nmc_certificate_key = 'kyc/s48/cert.pdf', practitioner_kind = 'doctor',
             nmc_doctor_name_as_per_register = 'Asha Rao' WHERE id = $1`, [ids.doctor]);
  await q(`INSERT INTO kyc_documents (user_id, document_type, storage_key, original_name, mime_type, size_bytes)
           VALUES ($1, 'nmc_certificate', 'kyc/s48/cert.pdf', 'certificate.pdf', 'application/pdf', 1000)
           ON CONFLICT (user_id, document_type) DO UPDATE SET storage_key = EXCLUDED.storage_key`, [ids.doctor]);
  r = await call('POST', '/written-orders/requisition', { token: t.doctor,
    body: { items: [{ product_id: P.otc, quantity: 2 }], typed_name: 'Dr Asha Rao', password: people.doctor.password, declaration: true } });
  const wo = r.json.data?.id;
  r = await call('POST', '/orders', { token: t.doctor, noAutoRx: true, body: { address_id: addr.doctor, pincode: PIN, items: [{ product_id: P.otc, quantity: 2 }],
    practitioner_declaration: true, written_order_id: wo } });
  const o5 = r.json.data?.order;
  check('a verified doctor orders with a signed written order', r.status === 201 && !!o5, r.json);
  if (o5) {
    await verify((await pay(o5.id, 'captured', undefined, t.doctor)).p, t.doctor);
    await q(`UPDATE users SET nmc_status = 'suspended', nmc_status_note = 'S48 test: suspended by the council' WHERE id = $1`, [ids.doctor]);
    const own5 = (await shipmentsOf(o5.id)).own;
    r = await call('POST', `/fulfilment/shipments/${own5}/check`, { token: t.pharmacist, body: { decision: 'release' } });
    check('the doctor\'s registration suspended before the approval → 409 BUYER_NOT_ELIGIBLE, no invoice (r.65(9)(b))', r.status === 409
      && r.json.code === 'BUYER_NOT_ELIGIBLE' && /registration/.test(r.json.message ?? '')
      && !(await q(`SELECT invoice_number FROM order_shipments WHERE id = $1`, [own5]))[0].invoice_number, r.json);
  }

  console.log('\nA4. A credit order whose bill is paid cannot be made larger (#7)');
  const o6 = (await placeOrder([{ product_id: P.otc, quantity: 1 }], { withRx: false })).order;
  await verify((await pay(o6.id, 'captured')).p);
  // Stand-in for a trade buyer's credit order already settled (maintenance role, test database only)
  await q(`UPDATE orders SET payment_terms = 'net_30', credit_settled_at = NOW() WHERE id = $1`, [o6.id]);
  r = await edit(o6.id, { lines: [{ order_item_id: (await lineOf(o6.id, P.otc)).id, quantity: 3 }] });
  check('raising it → 409 ORDER_EDIT_CREDIT_SETTLED, nothing changed', r.status === 409 && r.json.code === 'ORDER_EDIT_CREDIT_SETTLED'
    && (await lineOf(o6.id, P.otc)).supply_qty === 1, r.json);
}
