// Regression checks for the Sprint 6 security review findings
import { call, check, q } from '../sprint5/lib.mjs';
import { PIN, markPaid } from './fixtures.mjs';

export async function runSecurity({ t, P, addr, ids }) {
  const order = (token, address, items, extra = {}) => call('POST', '/orders', { token, body: { address_id: address, pincode: PIN, items, ...extra } });
  const one = [{ product_id: P.otc, quantity: 1 }];

  console.log('Order status changes (finding 1)');
  let r = await order(t.buyer, addr.buyer, one);
  const o1 = r.json.data?.order;
  r = await call('PATCH', `/orders/${o1.id}/status`, { token: t.packer, body: { status: 'confirmed' } });
  check('staff other than admin cannot change order status', r.status === 403, r.json);
  r = await call('PATCH', `/orders/${o1.id}/status`, { token: t.admin, body: { status: 'packed' } });
  check('admin cannot jump an unpaid order forward', r.status === 400, r.json);
  const st = (await q(`SELECT status FROM orders WHERE id = $1`, [o1.id]))[0].status;
  check('unpaid order is still pending payment', st === 'pending_payment', st);

  console.log('Refund cap (finding 2)');
  await markPaid(o1.id, o1.total_paise);
  r = await call('POST', '/payments/refund', { token: t.admin, body: { order_id: o1.id, reason: 'Goodwill' } });
  check('admin refunds the whole payment', r.status === 200 && r.json.data?.refunds?.[0]?.amount_paise === o1.total_paise, r.json);
  r = await call('POST', '/payments/refund', { token: t.admin, body: { order_id: o1.id, reason: 'Again' } });
  check('a second refund of the same money is refused', r.status === 400, r.json);
  r = await call('POST', `/orders/${o1.id}/cancel`, { token: t.buyer, body: { reason: 'Changed my mind' } });
  check('cancelling after a full refund refunds nothing more', r.status === 200 && r.json.data.refund_paise === 0 && r.json.data.refunds.length === 0, r.json);
  const total = (await q(`SELECT COALESCE(SUM(amount_paise), 0)::int AS n FROM refunds WHERE order_id = $1`, [o1.id]))[0].n;
  check('total refunded never exceeds what was paid', total === o1.total_paise, total);
  r = await order(t.buyer, addr.buyer, one);
  r = await call('POST', '/payments/refund', { token: t.admin, body: { order_id: r.json.data.order.id } });
  check('nothing to refund on an unpaid order', r.status === 400, r.json);

  console.log('Credit settlement (finding 4)');
  r = await order(t.trader, addr.trader, one, { payment_terms: 'net_30' });
  const credit = r.json.data?.order;
  await call('POST', `/orders/${credit.id}/cancel`, { token: t.trader, body: { reason: 'Duplicate' } });
  r = await call('POST', `/orders/${credit.id}/settle-credit`, { token: t.admin, body: { payment_reference: 'UTR-S6-1' } });
  check('a cancelled credit order cannot be "settled" to free credit again', r.status === 409, r.json);

  console.log('Order inputs (findings 6, 7, 9)');
  r = await order(t.buyer, addr.buyer2, one);
  check("cannot order to someone else's address", r.status === 404, r.json);
  r = await call('POST', '/orders/preview', { token: t.buyer, body: { address_id: addr.buyer, pincode: '110001', items: one } });
  check('delivery estimate uses the address PIN code, not the request', /12 hours/.test(r.json.data?.shipments?.[0]?.delivery_estimate || ''), r.json.data?.shipments?.[0]);
  r = await order(t.buyer, addr.buyer, [{ product_id: P.otc, quantity: 1 }, { product_id: P.otc, quantity: 1 }]);
  check('the same product twice in one order is refused', r.status === 422, r.json);
  await q(`UPDATE user_profiles SET wallet_balance_paise = 100000 WHERE user_id = $1`, [ids.buyer2]);
  r = await order(t.buyer2, addr.buyer2, one, { wallet_amount_paise: 100000 });
  const w = r.json.data?.order;
  const left = (await q(`SELECT wallet_balance_paise FROM user_profiles WHERE user_id = $1`, [ids.buyer2]))[0].wallet_balance_paise;
  const used = (await q(`SELECT wallet_used_paise, status FROM orders WHERE id = $1`, [w?.id]))[0];
  check('wallet use capped at the order amount', used && left === 100000 - used.wallet_used_paise && used.wallet_used_paise < 100000, { left, used });
  check('wallet-paid order goes straight to fulfilment', w?.total_paise === 0 && used?.status === 'packing', { w, used });

  console.log('Coupons (finding 8)');
  await q(`INSERT INTO coupons (code, type, value, uses_limit, per_user_limit) VALUES ('S6ONCE', 'flat', 1000, 2, 1)`);
  r = await order(t.buyer, addr.buyer, one, { coupon_code: 'S6ONCE' });
  check('coupon applies', r.status === 201, r.json);
  r = await order(t.buyer, addr.buyer, one, { coupon_code: 'S6ONCE' });
  check('per-buyer limit enforced', r.status === 400 && /already used/.test(r.json.message), r.json);
  r = await order(t.buyer2, addr.buyer2, one, { coupon_code: 'S6ONCE' });
  r = await order(t.trader, addr.trader, one, { coupon_code: 'S6ONCE' });
  check('total use limit enforced', r.status === 400, r.json);
  const uses = (await q(`SELECT uses_count FROM coupons WHERE code = 'S6ONCE'`))[0].uses_count;
  check('use count never passes the limit', uses === 2, uses);

  console.log('Partners and delivery staff (findings 10, 11, delivery scope)');
  const ship = (await q(`SELECT id FROM order_shipments WHERE order_id = $1`, [w.id]))[0].id;
  r = await call('POST', `/partner/shipments/${ship}/delivered`, { token: t.partner, body: { code: '000000', received_by_name: 'Someone', received_by_relation: 'self' } });
  const attempts = (await q(`SELECT handover_attempts FROM order_shipments WHERE id = $1`, [ship]))[0].handover_attempts;
  check("a partner cannot touch Dawabag's shipment or spend its code attempts", r.status === 404 && attempts === 0, { r: r.json, attempts });
  await q(`UPDATE vendors SET is_active = FALSE WHERE name = 'S6 Partner'`);
  r = await call('PUT', `/partner/products/${ship}/inventory`, { token: t.partner, body: { batches: [] } });
  check('a suspended partner cannot change stock', r.status === 403, r.json);
  r = await call('GET', '/partner/settlements', { token: t.partner });
  check('a suspended partner can still read settlements', r.status === 200, r.json);
  await q(`UPDATE vendors SET is_active = TRUE WHERE name = 'S6 Partner'`);
  r = await call('GET', `/orders/${w.id}`, { token: t.delivery });
  check('delivery staff cannot read an order that is not out for delivery', r.status === 404, r.json);
  r = await call('GET', `/invoices/shipments/${ship}.pdf`, { token: t.delivery, raw: true });
  check('…nor its invoice', r.status === 404, r.status);
}
