// Cancellation, refunds, credit notes, returns and partner settlement deductions (C-37)
import { call, check, q } from './lib.mjs';
import { PIN } from './fixtures.mjs';

let payCounter = 0;
async function markPaid(orderId, amount) {
  payCounter++;
  await q(`INSERT INTO payments (order_id, gateway_order_id, gateway_payment_id, status, amount_paise, paid_at)
           VALUES ($1, $2, $3, 'captured', $4, NOW())`, [orderId, `order_S5_${payCounter}_${Date.now()}`, `pay_S5_${payCounter}_${Date.now()}`, amount]);
  await q(`UPDATE orders SET status = 'packing' WHERE id = $1`, [orderId]);
}

export async function runAftercare({ t, P, addr, ids }) {
  const order = async (items, extra = {}, token = t.buyer, address = addr.buyer) =>
    call('POST', '/orders', { token, body: { address_id: address, pincode: PIN, items, ...extra } });
  const shipment = async (orderId) => (await q(`SELECT id, invoice_number FROM order_shipments WHERE order_id = $1`, [orderId]))[0];

  console.log('Cancellation (C-37)');
  let r = await order([{ product_id: P.own, quantity: 2 }], { wallet_amount_paise: 3000 });
  const o1 = r.json.data?.order;
  check('order placed with wallet part-payment', r.status === 201 && !!o1, r.json);
  await markPaid(o1.id, o1.total_paise);
  const reservedBefore = (await q(`SELECT quantity_reserved FROM inventory_batches WHERE product_id = $1`, [P.own]))[0].quantity_reserved;
  r = await call('POST', `/orders/${o1.id}/cancel`, { token: t.trader, body: { reason: 'Not mine' } });
  check("another buyer cannot cancel the order", r.status === 404, r.json);
  r = await call('POST', `/orders/${o1.id}/cancel`, { token: t.buyer, body: { reason: 'Ordered by mistake' } });
  const methods = (r.json.data?.refunds || []).map((l) => `${l.method}:${l.status}`).sort();
  check('buyer cancels a paid order: gateway leg pending, wallet leg refunded at once', r.status === 200
    && methods.join() === 'gateway:pending,wallet:processed' && r.json.data.refund_paise === o1.total_paise + 3000, r.json);
  check('credit note issued in the Dawabag credit-note series', /^DWBC\/\d{4}\/\d{5}$/.test(r.json.data?.credit_notes?.[0] || ''), r.json.data);
  const reservedAfter = (await q(`SELECT quantity_reserved FROM inventory_batches WHERE product_id = $1`, [P.own]))[0].quantity_reserved;
  check('cancellation releases reserved stock', reservedAfter === reservedBefore - 2, { reservedBefore, reservedAfter });
  const wallet = (await q(`SELECT wallet_balance_paise FROM user_profiles WHERE user_id = $1`, [ids.buyer]))[0].wallet_balance_paise;
  check('wallet part refunded to the wallet', wallet === 5000, wallet);
  const gw = (await q(`SELECT id, failure_reason FROM refunds WHERE order_id = $1 AND method = 'gateway'`, [o1.id]))[0];
  check('gateway refund waits for accounts when Razorpay is not configured', /not configured/.test(gw?.failure_reason || ''), gw);
  r = await call('POST', `/orders/${o1.id}/cancel`, { token: t.buyer, body: { reason: 'again' } });
  check('cannot cancel twice', r.status === 409, r.json);
  r = await call('POST', `/returns/refunds/admin/${gw.id}/processed`, { token: t.buyer, body: { reference: 'UTR123' } });
  check('buyer cannot mark refunds processed', r.status === 403, r.json);
  r = await call('POST', `/returns/refunds/admin/${gw.id}/processed`, { token: t.admin, body: { reference: 'RZP-DASH-001' } });
  const pay = (await q(`SELECT status, refund_amount_paise FROM payments WHERE order_id = $1`, [o1.id]))[0];
  check('accounts marks the gateway refund done; payment shows refunded', r.status === 200 && pay.status === 'refunded'
    && pay.refund_amount_paise === o1.total_paise, pay);
  r = await call('GET', '/returns/refunds/my', { token: t.buyer });
  check('buyer sees their refunds', r.json.data?.refunds?.filter((x) => x.order_id === o1.id).length === 2, r.json);

  r = await order([{ product_id: P.own, quantity: 1 }], { payment_terms: 'net_30' }, t.trader, addr.trader);
  const o2 = r.json.data?.order;
  const usedBefore = (await q(`SELECT credit_used_paise FROM users WHERE id = $1`, [ids.trader]))[0].credit_used_paise;
  r = await call('POST', `/orders/${o2.id}/cancel`, { token: t.trader, body: { reason: 'Duplicate order' } });
  const usedAfter = (await q(`SELECT credit_used_paise FROM users WHERE id = $1`, [ids.trader]))[0].credit_used_paise;
  check('cancelling a credit order reduces credit used', r.status === 200 && r.json.data.refunds?.[0]?.method === 'credit_adjustment'
    && usedAfter === usedBefore - o2.total_paise, { usedBefore, usedAfter, r: r.json });

  r = await order([{ product_id: P.own, quantity: 1 }]);
  const o3 = r.json.data.order;
  await markPaid(o3.id, o3.total_paise);
  const s3 = await shipment(o3.id);
  await call('POST', `/fulfilment/shipments/${s3.id}/pack`, { token: t.packer });
  r = await call('POST', `/orders/${o3.id}/cancel`, { token: t.buyer, body: { reason: 'Too late?' } });
  check('buyer cannot cancel once packing has started', r.status === 409, r.json);
  r = await call('GET', `/orders/${o3.id}`, { token: t.buyer });
  check('order detail says it can no longer be cancelled', r.json.data?.can_cancel === false, r.json.data?.can_cancel);

  console.log('Dispatch seal, delivery and returns');
  r = await call('POST', `/fulfilment/shipments/${s3.id}/dispatch`, { token: t.packer, body: { courier_partner: 'Delhivery', awb_number: 'S5AWB1' } });
  check('dispatch without a seal number refused', r.status === 422, r.json);
  r = await call('POST', `/fulfilment/shipments/${s3.id}/dispatch`, { token: t.packer, body: { courier_partner: 'Delhivery', awb_number: 'S5AWB1', seal_number: 'SEAL-S5-1' } });
  check('sealed dispatch', r.status === 200, r.json);
  r = await call('POST', `/returns`, { token: t.buyer, body: { shipment_id: s3.id, reason: 'damaged', description: 'Strip was crushed in transit', items: [{ order_item_id: (await q(`SELECT id FROM order_items WHERE order_id = $1`, [o3.id]))[0].id, quantity: 1 }] } });
  check('return refused before delivery', r.status === 409, r.json);
  r = await call('POST', `/fulfilment/shipments/${s3.id}/delivered`, { token: t.admin });
  check('OTC shipment delivered without a code (scope rx_only)', r.status === 200, r.json);
  const item3 = (await q(`SELECT id FROM order_items WHERE order_id = $1`, [o3.id]))[0].id;
  const ret = (reason, qty = 1, token = t.buyer) => call('POST', '/returns', { token, body: {
    shipment_id: s3.id, reason, description: 'Strip was crushed in transit', items: [{ order_item_id: item3, quantity: qty }] } });
  r = await ret('damaged', 2);
  check('cannot return more than was delivered', r.status === 400, r.json);
  r = await ret('recalled');
  check("'recalled' needs an actual recall of the batch", r.status === 400, r.json);
  r = await ret('damaged', 1, t.trader);
  check("another buyer cannot return it", r.status === 404, r.json);
  r = await ret('damaged');
  const ret1 = r.json.data;
  check('buyer reports a damaged item', r.status === 201 && /^RET-\d{4}-\d{6}$/.test(ret1?.return_no || ''), r.json);
  r = await ret('damaged');
  check('the same unit cannot be returned twice', r.status === 400, r.json);
  r = await call('POST', `/returns/${ret1.id}/decide`, { token: t.packer, body: { approve: true, notes: 'ok' } });
  check('packer cannot approve returns', r.status === 403, r.json);
  r = await call('POST', `/returns/${ret1.id}/decide`, { token: t.pharmacist, body: { approve: true, notes: 'Photo shows crushed strip' } });
  check('pharmacist approves: credit note and full refund of the line', r.status === 200 && r.json.data.status === 'approved'
    && /^DWBC\//.test(r.json.data.credit_note_number || '') && r.json.data.refund_paise === 10080 /* ₹90 + 12% GST; delivery not refunded */, r.json);
  const o3s = (await q(`SELECT o.status, s.status AS s FROM orders o JOIN order_shipments s ON s.order_id = o.id WHERE o.id = $1`, [o3.id]))[0];
  check('fully returned shipment and order marked returned', o3s.status === 'returned' && o3s.s === 'returned', o3s);
  const stock = (await q(`SELECT quantity_available FROM inventory_batches WHERE product_id = $1`, [P.own]))[0].quantity_available;
  check('returned medicine is not restocked', stock === 199, stock);
  r = await call('POST', `/returns/${ret1.id}/close`, { token: t.packer, body: { disposition: 'destroyed' } });
  check('returned goods recorded as destroyed', r.status === 200 && r.json.data.status === 'closed', r.json);
  r = await call('GET', `/returns/${ret1.id}`, { token: t.buyer });
  check('buyer sees return with credit note and refund', r.json.data?.credit_notes?.length === 1 && r.json.data?.refunds?.length >= 1, r.json.data);
  const cnId = (await q(`SELECT id FROM credit_notes WHERE return_id = $1`, [ret1.id]))[0].id;
  r = await call('GET', `/invoices/credit-notes/${cnId}.pdf`, { token: t.buyer, raw: true });
  check('credit note PDF', r.status === 200 && r.buf.subarray(0, 4).toString() === '%PDF', { status: r.status });

  await q(`UPDATE order_shipments SET delivered_at = NOW() - INTERVAL '3 days' WHERE id = $1`, [s3.id]);
  r = await ret('wrong_item');
  check('damaged/wrong/missing must be reported within 48 hours', r.status === 409 || r.status === 400, r.json);

  console.log('Partner return → settlement deduction');
  r = await order([{ product_id: P.part, quantity: 2 }]);
  const o4 = r.json.data.order;
  await markPaid(o4.id, o4.total_paise);
  const s4 = await shipment(o4.id);
  check('partner line shipped under the partner invoice series', /^S5P\//.test(s4.invoice_number), s4);
  r = await call('POST', `/partner/shipments/${s4.id}/dispatch`, { token: t.partner, body: { courier_partner: 'Shadowfax', awb_number: 'S5P-AWB', seal_number: 'SEAL-P-1' } });
  check('partner sealed dispatch', r.status === 200, r.json);
  r = await call('POST', `/partner/shipments/${s4.id}/delivered`, { token: t.partner });
  const item4 = (await q(`SELECT id FROM order_items WHERE order_id = $1`, [o4.id]))[0].id;
  r = await call('POST', '/returns', { token: t.buyer, body: { shipment_id: s4.id, reason: 'expired', description: 'Batch expiry already passed', items: [{ order_item_id: item4, quantity: 1 }] } });
  const ret2 = r.json.data;
  r = await call('POST', `/returns/${ret2.id}/decide`, { token: t.admin, body: { approve: true, notes: 'Expired stock supplied' } });
  check('partner return approved with a partner-series credit note', /^S5PC\//.test(r.json.data?.credit_note_number || ''), r.json);
  r = await call('GET', '/partner/returns', { token: t.partner });
  check('partner sees the return', r.json.data?.returns?.some((x) => x.id === ret2.id), r.json);
  const today = new Date().toISOString().slice(0, 10);
  r = await call('POST', '/admin/settlements/generate', { token: t.admin, body: { period_from: today, period_to: today } });
  const batch = (await q(`SELECT * FROM settlement_batches WHERE partner_id = (SELECT id FROM vendors WHERE name = 'S5 Partner')`))[0];
  // Consumer price 2 × ₹90 = 18000 taxable; one unit returned → 9000 net; deduction 9000 + 12% GST
  check('settlement nets the return: taxable is one unit, deduction recorded', batch && Number(batch.taxable_value_paise) === 9000
    && Number(batch.return_deductions_paise) === 10080, batch);
  const adj = (await q(`SELECT settlement_batch_id FROM settlement_adjustments WHERE return_id = $1`, [ret2.id]))[0];
  check('the deduction is tied to the batch', adj?.settlement_batch_id === batch?.id, adj);
  r = await call('POST', `/returns/${ret2.id}/decide`, { token: t.admin, body: { approve: false, notes: 'again' } });
  check('a decided return cannot be decided again', r.status === 409, r.json);
}
