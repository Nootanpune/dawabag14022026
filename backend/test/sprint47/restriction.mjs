// Sprint 47 — who may buy a product: everyone (default) / doctors and hospitals only (verified
// registration, Sprint 44; Drugs Rules r.65(9)(b)) / licensed trade buyers only (checked, in-date
// drug licences, Sprint 30 / 32; C-14, C-33). Set only by a registered pharmacist with a reason;
// append-only log; audited (C-46). Enforced by the server on every buyer path.
import { call, check, db, q } from '../sprint5/lib.mjs';
import { writtenOrderFor } from '../support/sprint44Fixtures.mjs';
import { P, PIN, addr, apiLogin, ids, refused, t } from './fixtures.mjs';

const HOSP_LABEL = 'Supplied only to doctors and hospitals';
const TRADE_LABEL = 'Supplied only to licensed trade buyers';
const setRestriction = (token, productId, restriction, reason = 'Hospital use only: given under specialist supervision (demo)') =>
  call('PUT', `/buyer-restriction/products/${productId}`, { token, body: { restriction, reason } });
const product = (token, id) => call('GET', `/products/${id}`, { token });
const search = (token, text) => call('GET', `/products/search?q=${encodeURIComponent(text)}`, { token });
const cartPut = (token, id, quantity) => call('PUT', `/cart/items/${id}`, { token, body: { quantity } });
const placeOrder = (who, items, extra = {}) => call('POST', '/orders', { token: t[who],
  body: { address_id: addr[who], pincode: PIN, items, ...extra } });
const orderCount = async (who) => (await q('SELECT COUNT(*)::int AS n FROM orders WHERE user_id = $1', [ids[who]]))[0].n;
const restrictionOfRow = async (id) => (await q('SELECT buyer_restriction FROM products WHERE id = $1', [id]))[0].buyer_restriction;
/** A placed order made paid and confirmed (stand-in for the payment step, which is not this suite's subject). */
async function markPaid(order) {
  await q(`INSERT INTO payments (order_id, gateway_order_id, gateway_payment_id, status, amount_paise, paid_at)
           VALUES ($1, $2, $3, 'captured', $4, NOW())`, [order.id, `order_S47_${order.id.slice(0, 8)}`, `pay_S47_${order.id.slice(0, 8)}`, order.total_paise]);
  await q(`UPDATE orders SET status = 'confirmed' WHERE id = $1`, [order.id]);
}

export async function runRestriction() {
  console.log('\nA. Default: everyone — nothing changes for any product');
  check('no product outside this suite is restricted (the control applies to none by default)',
    (await q(`SELECT COUNT(*)::int AS n FROM products WHERE buyer_restriction <> 'everyone' AND sku NOT LIKE 'S47-%'`))[0].n === 0);
  check('new products start as everyone', (await q(`SELECT COUNT(*)::int AS n FROM products WHERE sku LIKE 'S47-%' AND buyer_restriction <> 'everyone'`))[0].n === 0);
  let r = await product(t.consumer, P.hosp);
  check('product page carries buyer_restriction everyone, no label, buyer_may_buy true', r.status === 200 && r.json.data?.buyer_restriction === 'everyone'
    && r.json.data.buyer_restriction_label === null && r.json.data.buyer_may_buy === true, r.json.data);
  r = await cartPut(t.consumer, P.hosp, 1);
  check('a consumer adds it to the cart as before', r.status === 200, r.json);
  await cartPut(t.consumer, P.hosp, 0);

  console.log('\nB. Only a registered pharmacist decides, with a reason');
  r = await setRestriction(t.admin, P.hosp, 'practitioners_only');
  check('an admin cannot set it (403)', r.status === 403, r.json);
  r = await setRestriction(t.superAdmin, P.hosp, 'practitioners_only');
  check('… nor a super admin (403)', r.status === 403, r.json);
  r = await setRestriction(t.consumer, P.hosp, 'practitioners_only');
  check('… nor a buyer (403)', r.status === 403, r.json);
  r = await setRestriction(t.pharmacist, P.hosp, 'practitioners_only', 'short');
  check('a pharmacist without a proper reason → 400', r.status === 400 && /at least 10/.test(r.json.message ?? ''), r.json);
  r = await call('PUT', `/buyer-restriction/products/${P.hosp}`, { token: t.pharmacist, body: { restriction: 'nurses_only', reason: 'x'.repeat(20) } });
  check('an unknown value → 422', r.status === 422, r.json);
  r = await setRestriction(t.pharmacistLapsed, P.hosp, 'practitioners_only');
  check('a pharmacist whose registration lapsed → 403 PHARMACIST_REGISTRATION_INVALID', r.status === 403 && r.json.code === 'PHARMACIST_REGISTRATION_INVALID', r.json);
  check('… nothing changed', (await restrictionOfRow(P.hosp)) === 'everyone');
  r = await setRestriction(t.pharmacist, P.hosp, 'practitioners_only');
  check('the registered pharmacist restricts it to doctors and hospitals', r.status === 200 && r.json.data?.buyer_restriction === 'practitioners_only'
    && (await restrictionOfRow(P.hosp)) === 'practitioners_only', r.json);
  r = await setRestriction(t.pharmacist, P.trade, 'trade_only', 'Supplied only through licensed trade channels (demo)');
  check('… and another to licensed trade buyers', r.status === 200 && (await restrictionOfRow(P.trade)) === 'trade_only', r.json);
  r = await setRestriction(t.pharmacist, P.hosp, 'practitioners_only');
  check('the same value again → 400 "already"', r.status === 400 && /already/.test(r.json.message ?? ''), r.json);
  check('audit: product_buyer_restriction_set with who and why', (await q(
    `SELECT 1 FROM audit_logs WHERE action = 'product_buyer_restriction_set' AND performed_by = $1 AND new_value->>'product_id' = $2
       AND new_value->>'buyer_restriction' = 'practitioners_only' AND notes LIKE 'Hospital use only%'`, [ids.pharmacist, P.hosp])).length === 1);
  r = await call('GET', `/buyer-restriction/products/${P.hosp}/log`, { token: t.admin });
  check('admins see the history: who, when, why', r.status === 200 && r.json.data?.length === 1 && r.json.data[0].old_restriction === 'everyone'
    && r.json.data[0].new_restriction === 'practitioners_only' && r.json.data[0].set_by_name === 'S47 Pharmacist Asha'
    && /Hospital use only/.test(r.json.data[0].reason) && !!r.json.data[0].set_at, r.json.data);
  r = await call('GET', `/buyer-restriction/products/${P.hosp}/log`, { token: t.consumer });
  check('… buyers do not (403)', r.status === 403, r.status);
  r = await call('GET', '/buyer-restriction/products', { token: t.admin });
  check('the restricted list names both products', r.status === 200 && [P.hosp, P.trade].every((id) => r.json.data.some((x) => x.id === id)), r.json.data);
  r = await call('GET', `/online-sale/products?q=S47-HOSP`, { token: t.admin });
  check('the online-sale page shows who may buy', r.status === 200 && r.json.data.products[0]?.buyer_restriction === 'practitioners_only', r.json.data?.products);

  const api = await apiLogin();
  if (api) {
    try {
      let e = await refused(api, `UPDATE product_buyer_restriction_log SET reason = 'changed' WHERE product_id = $1`, [P.hosp]);
      // refused by the append-only trigger (23514), or earlier by the table privileges (42501)
      check('database (API login): the log cannot be changed', ['23514', '42501'].includes(e?.code), e);
      e = await refused(api, `DELETE FROM product_buyer_restriction_log WHERE product_id = $1`, [P.hosp]);
      check('… nor deleted', ['23514', '42501'].includes(e?.code), e);
      e = await refused(api, `UPDATE products SET buyer_restriction = 'everyone' WHERE id = $1`, [P.hosp]);
      check('… and a change without who / why is refused', e?.code === '23514' && /with a reason/.test(e.message), e);
      e = await refused(api, `UPDATE products SET buyer_restriction = 'nurses' WHERE id = $1`, [P.hosp]);
      check('… as is an unknown value', e?.code === '23514', e);
    } finally { await api.end(); }
  }

  console.log('\nC. Listed for everyone with a label; no Add for buyers who may not buy it');
  r = await search(undefined, 'Hospitase');
  let hit = r.json.data?.products?.find((p) => p.id === P.hosp);
  check('search (guest): listed with the label, buyer_may_buy false', r.status === 200 && hit?.buyer_restriction === 'practitioners_only'
    && hit.buyer_restriction_label === HOSP_LABEL && hit.buyer_may_buy === false, hit);
  r = await search(t.doctor, 'Hospitase');
  hit = r.json.data?.products?.find((p) => p.id === P.hosp);
  check('search (verified doctor): buyer_may_buy true', hit?.buyer_may_buy === true && hit.buyer_restriction_label === HOSP_LABEL, hit);
  r = await search(t.retailer, 'Tradeline');
  hit = r.json.data?.products?.find((p) => p.id === P.trade);
  check('search (licensed retailer): the trade product can be bought, labelled', hit?.buyer_may_buy === true && hit.buyer_restriction_label === TRADE_LABEL, hit);
  r = await search(t.consumer, 'Demoopen');
  hit = r.json.data?.products?.find((p) => p.id === P.open);
  check('search: an unrestricted product has buyer_restriction everyone, no label, buyer_may_buy true',
    hit?.buyer_restriction === 'everyone' && hit.buyer_restriction_label === null && hit.buyer_may_buy === true, hit);
  r = await product(t.consumer, P.hosp);
  check('product page (consumer): label, buyer_may_buy false', r.status === 200 && r.json.data?.buyer_restriction_label === HOSP_LABEL && r.json.data.buyer_may_buy === false, r.json.data);
  r = await product(t.doctorPending, P.hosp);
  check('… a doctor whose registration is not verified: false', r.json.data?.buyer_may_buy === false, r.json.data);
  r = await product(t.doctor, P.trade);
  check('… a verified doctor may buy a trade-only product', r.json.data?.buyer_may_buy === true, r.json.data);
  r = await product(t.retailer, P.hosp);
  check('… a licensed retailer may not buy a doctors-only product', r.json.data?.buyer_may_buy === false, r.json.data);
  r = await product(t.retailerLapsed, P.trade);
  check('… a retailer whose licence lapsed may not buy a trade-only product', r.json.data?.buyer_may_buy === false, r.json.data);

  console.log('\nD. Cart');
  r = await cartPut(t.consumer, P.hosp, 1);
  check('consumer adds a doctors-only product → 403 BUYER_RESTRICTED with a plain message', r.status === 403 && r.json.code === 'BUYER_RESTRICTED'
    && /is supplied only to doctors and hospitals whose medical registration Dawabag has verified/.test(r.json.message ?? ''), r.json);
  r = await cartPut(t.doctorPending, P.hosp, 1);
  check('a doctor not yet verified → 403 with what to do', r.status === 403 && r.json.code === 'BUYER_RESTRICTED' && /not verified or has lapsed/.test(r.json.message ?? ''), r.json);
  r = await cartPut(t.retailer, P.hosp, 1);
  check('a licensed retailer → 403 for doctors-only', r.status === 403 && r.json.code === 'BUYER_RESTRICTED', r.json);
  r = await cartPut(t.retailerLapsed, P.trade, 1);
  check('a retailer whose licence lapsed → 403 for trade-only, naming the licence', r.status === 403 && r.json.code === 'BUYER_RESTRICTED'
    && /drug licence is not approved or has lapsed/.test(r.json.message ?? ''), r.json);
  r = await cartPut(t.consumer, P.trade, 1);
  check('a consumer → 403 for trade-only', r.status === 403 && r.json.code === 'BUYER_RESTRICTED' && /licensed trade buyers/.test(r.json.message ?? ''), r.json);
  r = await cartPut(t.doctor, P.hosp, 1);
  check('a verified doctor adds the doctors-only product', r.status === 200 && r.json.data.items.some((i) => i.product_id === P.hosp && i.available), r.json);
  r = await cartPut(t.retailer, P.trade, 2);
  check('a licensed retailer adds the trade-only product', r.status === 200 && r.json.data.items.some((i) => i.product_id === P.trade && i.available), r.json);
  // Restricted after it was added (stand-in: the line put back by the maintenance role)
  await q(`INSERT INTO carts (user_id) VALUES ($1) ON CONFLICT DO NOTHING`, [ids.consumer]);
  await q(`INSERT INTO cart_items (user_id, product_id, quantity) VALUES ($1, $2, 3)`, [ids.consumer, P.hosp]);
  r = await call('GET', '/cart', { token: t.consumer });
  let line = r.json.data?.items?.find((i) => i.product_id === P.hosp);
  check('a line restricted after it was added: not available, the label as the reason', line?.available === false && line.issue === HOSP_LABEL
    && line.buyer_restriction === 'practitioners_only', line);
  r = await cartPut(t.consumer, P.hosp, 2);
  check('… the buyer may still lower it', r.status === 200, r.json);
  r = await cartPut(t.consumer, P.hosp, 3);
  check('… but not raise it again (403)', r.status === 403 && r.json.code === 'BUYER_RESTRICTED', r.json);
  r = await cartPut(t.consumer, P.hosp, 0);
  check('… and remove it', r.status === 200 && !r.json.data.items.some((i) => i.product_id === P.hosp), r.json);

  console.log('\nE. Order placement (the server decides, whatever the screen showed)');
  const n0 = await orderCount('consumer');
  r = await placeOrder('consumer', [{ product_id: P.hosp, quantity: 1 }]);
  check('consumer orders a doctors-only product → 403 BUYER_RESTRICTED, nothing placed', r.status === 403 && r.json.code === 'BUYER_RESTRICTED'
    && (await orderCount('consumer')) === n0, r.json);
  r = await placeOrder('consumer', [{ product_id: P.open, quantity: 1 }, { product_id: P.trade, quantity: 1 }]);
  check('… a cart mixing an open and a trade-only product → 403, nothing placed', r.status === 403 && r.json.code === 'BUYER_RESTRICTED'
    && (await orderCount('consumer')) === n0, r.json);
  r = await placeOrder('doctorPending', [{ product_id: P.hosp, quantity: 1 }], { practitioner_declaration: true });
  check('a doctor not yet verified cannot order it (registration refused first, Sprint 44)', r.status === 403
    && ['PRACTITIONER_REGISTRATION_INVALID', 'BUYER_RESTRICTED'].includes(r.json.code), r.json);
  r = await placeOrder('doctor', [{ product_id: P.hosp, quantity: 1 }], { practitioner_declaration: true });
  check('a verified doctor still needs the signed written order (r.65(9)(b), unchanged) → 422', r.status === 422 && r.json.code === 'WRITTEN_ORDER_REQUIRED', r.json);
  const wo = await writtenOrderFor(db, ids.doctor, [{ product_id: P.hosp, quantity: 1 }]);
  r = await placeOrder('doctor', [{ product_id: P.hosp, quantity: 1 }], { practitioner_declaration: true, written_order_id: wo });
  const doctorOrder = r.json.data?.order;
  check('… with the written order: placed', r.status === 201 && !!doctorOrder?.id, r.json);
  r = await placeOrder('retailer', [{ product_id: P.hosp, quantity: 1 }]);
  check('a licensed retailer cannot order a doctors-only product (403)', r.status === 403 && r.json.code === 'BUYER_RESTRICTED', r.json);
  r = await placeOrder('retailer', [{ product_id: P.trade, quantity: 2 }]);
  check('a licensed retailer orders the trade-only product', r.status === 201, r.json);
  r = await call('POST', '/orders/preview', { token: t.consumer, body: { address_id: addr.consumer, pincode: PIN, items: [{ product_id: P.hosp, quantity: 1 }] } });
  check('checkout preview refuses it too (403)', r.status === 403 && r.json.code === 'BUYER_RESTRICTED', r.json);

  console.log('\nF. Lines added before the invoice (Sprint 44 order changes)');
  r = await placeOrder('consumer', [{ product_id: P.open, quantity: 1 }]);
  const cOrder = r.json.data?.order;
  check('consumer places an order of an open product', r.status === 201, r.json);
  await markPaid(cOrder);
  r = await call('POST', `/orders/${cOrder.id}/edit`, { token: t.consumer, body: { add: [{ product_id: P.hosp, quantity: 1 }] } });
  check('adding a doctors-only product to it → 403 BUYER_RESTRICTED, nothing added', r.status === 403 && r.json.code === 'BUYER_RESTRICTED'
    && (await q('SELECT COUNT(*)::int AS n FROM order_items WHERE order_id = $1', [cOrder.id]))[0].n === 1, r.json);
  const line1 = (await q('SELECT id FROM order_items WHERE order_id = $1', [cOrder.id]))[0].id;
  r = await call('POST', `/orders/${cOrder.id}/edit`, { token: t.consumer, body: { lines: [{ order_item_id: line1, quantity: 2 }] } });
  check('… raising the open product still works', r.status === 200, r.json);
  await markPaid(doctorOrder);
  r = await call('POST', `/orders/${doctorOrder.id}/edit`, { token: t.doctor, body: { add: [{ product_id: P.trade, quantity: 1 }] } });
  check('a verified doctor adding a trade-only product is not refused for who may buy (the written-order rule decides)',
    r.json.code !== 'BUYER_RESTRICTED' && (r.status === 200 || r.json.code === 'WRITTEN_ORDER_REQUIRED'), r.json);

  console.log('\nG. Refills');
  r = await placeOrder('consumer', [{ product_id: P.later, quantity: 1 }]);
  const lOrder = r.json.data?.order;
  r = await call('POST', '/refills', { token: t.consumer, body: { order_id: lOrder.id, frequency_days: 30 } });
  const subId = r.json.data?.id;
  check('a consumer subscribes to a refill of an open product', r.status === 201 && !!subId, r.json);
  r = await setRestriction(t.pharmacist, P.later, 'practitioners_only', 'Owner decision: doctors and hospitals only (demo)');
  check('the pharmacist later restricts it to doctors and hospitals', r.status === 200, r.json);
  r = await call('POST', '/refills', { token: t.consumer, body: { order_id: lOrder.id, frequency_days: 30 } });
  check('a new refill of that order → 400 nothing can be refilled', r.status === 400 && /Nothing in this order can be refilled/.test(r.json.message ?? ''), r.json);
  await q('UPDATE refill_subscriptions SET next_refill_date = CURRENT_DATE WHERE id = $1', [subId]);
  r = await call('POST', '/admin/jobs/refill_orders/run', { token: t.superAdmin });
  const placed = (await q('SELECT COUNT(*)::int AS n FROM orders WHERE refill_subscription_id = $1', [subId]))[0].n;
  const failed = (await q(`SELECT notes FROM audit_logs WHERE action = 'refill_failed' AND new_value->>'subscription_id' = $1`, [subId]))[0];
  check('the due refill is not placed; the buyer is told why (refill_failed: supplied only to doctors and hospitals)', r.status === 200 && placed === 0
    && /supplied only to doctors and hospitals/.test(failed?.notes ?? ''), { r: r.json, placed, failed });

  console.log('\nH. Lifting it again (pharmacist, with a reason) — history kept');
  r = await setRestriction(t.pharmacist, P.later, 'everyone', 'Owner decided it may be sold to everyone (demo)');
  check('lifted back to everyone', r.status === 200 && (await restrictionOfRow(P.later)) === 'everyone', r.json);
  r = await call('GET', `/buyer-restriction/products/${P.later}/log`, { token: t.pharmacist });
  check('the log keeps both changes, newest first', r.status === 200 && r.json.data?.map((l) => l.new_restriction).join() === 'everyone,practitioners_only', r.json.data);
  r = await cartPut(t.consumer, P.later, 1);
  check('the consumer can add it again', r.status === 200, r.json);
  await cartPut(t.consumer, P.later, 0);
}
