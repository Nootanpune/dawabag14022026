// Sprint 38 — the emergency stop for prescription-medicine sales (owner decision
// 2026-10-03; C-08, C-46): open by default; a super-admin pauses with a reason and a
// reference, confirmed; buyers get a plain message; paid parcels holding such lines are
// held at dispatch; resume restores everything; both are audited.
import { call, check, q } from '../sprint5/lib.mjs';
import { P, PIN, addr, ids, t } from './fixtures.mjs';
import { shared } from './registers.mjs';

const cart = (token, productId, quantity) => call('PUT', `/cart/items/${productId}`, { token, body: { quantity } });

export async function runEmergencyStop() {
  console.log('H. Emergency stop: pause and resume prescription-medicine sales');
  let r = await call('GET', '/sales-status');
  check('public status: open by default', r.status === 200 && r.json.data?.rx_sales === 'open' && r.json.data.message === null, r.json);
  await cart(t.buyer, P.rx, 1);   // already in the cart before the pause

  const body = { reason: 'S38 drill: notification received, legal review pending', reference: 'GSR S38(E)' };
  r = await call('POST', '/admin/emergency-stop/pause', { token: t.admin, body });
  check('pausing needs the typed confirmation', r.status === 422 && /Type PAUSE/.test(r.json.message), r.json);
  r = await call('POST', '/admin/emergency-stop/pause', { token: t.opsAdmin, body: { ...body, confirm: 'PAUSE' } });
  check('only a super-admin may pause', r.status === 403, r.json);
  r = await call('POST', '/admin/emergency-stop/pause', { token: t.admin, body: { reference: 'X1', reason: 'short', confirm: 'PAUSE' } });
  check('a reason is required', r.status === 422, r.json);
  r = await call('POST', '/admin/emergency-stop/pause', { token: t.admin, body: { ...body, confirm: 'PAUSE' } });
  check('super-admin pauses with reason and reference', r.status === 200 && r.json.data?.state?.paused === true, r.json);
  r = await call('POST', '/admin/emergency-stop/pause', { token: t.admin, body: { ...body, confirm: 'PAUSE' } });
  check('pausing twice is refused plainly', r.status === 409, r.json);

  r = await call('GET', '/sales-status');
  check('public status: paused, with the message and reference but not the internal reason', r.json.data?.rx_sales === 'paused'
    && /paused/.test(r.json.data.message) && r.json.data.reference === 'GSR S38(E)' && !JSON.stringify(r.json).includes('legal review'), r.json);

  r = await cart(t.buyer, P.h1, 1);
  check('adding a prescription medicine to the cart: a plain message, code RX_SALES_PAUSED', r.status === 409 && r.json.code === 'RX_SALES_PAUSED'
    && /prescription medicines are paused/i.test(r.json.message) && /GSR S38\(E\)/.test(r.json.message), r.json);
  r = await cart(t.buyer, P.otc, 1);
  check('other products still go in', r.status === 200, r.json);
  r = await call('GET', '/cart', { token: t.buyer });
  const line = r.json.data?.items?.find((i) => i.product_id === P.rx);
  check('the cart marks the prescription line as paused and carries the banner text', line?.available === false
    && /paused/.test(line.issue) && /paused/.test(r.json.data?.rx_sales_paused ?? ''), r.json.data);
  r = await cart(t.buyer, P.rx, 0);
  check('the buyer can still remove it', r.status === 200, r.json);

  r = await call('POST', '/orders', { token: t.buyer, body: { address_id: addr.buyer, pincode: PIN, items: [{ product_id: P.rx, quantity: 1 }] } });
  check('checkout of a prescription medicine is refused with the message (not an error page)', r.status === 409
    && r.json.code === 'RX_SALES_PAUSED' && /remove S38 S38-RX from your cart/.test(r.json.message), r.json);
  r = await call('POST', '/orders', { token: t.buyer, body: { address_id: addr.buyer, pincode: PIN, items: [{ product_id: P.otc, quantity: 1 }] } });
  check('an order without prescription medicines goes through', r.status === 201, r.json);

  r = await call('POST', `/partner/shipments/${shared.heldPartnerShipment}/dispatch`, { token: t.partner,
    body: { courier_partner: 'Shree Courier', awb_number: 'S38PAWB-HELD', seal_number: 'SEAL-S38-HELD' } });
  check('an already-paid, checked partner parcel with an H1 line is held at dispatch, with instructions', r.status === 409
    && r.json.code === 'RX_SALES_PAUSED' && /Keep this parcel/.test(r.json.message), r.json);
  const held = (await q(`SELECT status FROM order_shipments WHERE id = $1`, [shared.heldPartnerShipment]))[0];
  check('… and nothing moved', held.status === 'pending' || held.status === 'packed', held);

  r = await call('GET', '/admin/emergency-stop', { token: t.opsAdmin });
  check('admins see the state with the reason and the history', r.status === 200 && r.json.data?.state?.reason === body.reason
    && r.json.data.history?.[0]?.action === 'rx_sales_paused', r.json.data);

  r = await call('POST', '/admin/emergency-stop/resume', { token: t.admin, body: { note: 'S38 drill over' } });
  check('resuming needs the typed confirmation too', r.status === 422, r.json);
  r = await call('POST', '/admin/emergency-stop/resume', { token: t.admin, body: { note: 'S38 drill over', confirm: 'RESUME' } });
  check('super-admin resumes', r.status === 200 && r.json.data?.state?.paused === false, r.json);
  r = await call('GET', '/sales-status');
  check('public status: open again', r.json.data?.rx_sales === 'open', r.json);
  r = await cart(t.buyer, P.rx, 1);
  check('prescription medicines go in the cart again', r.status === 200, r.json);
  r = await call('POST', `/partner/shipments/${shared.heldPartnerShipment}/dispatch`, { token: t.partner,
    body: { courier_partner: 'Shree Courier', awb_number: 'S38PAWB-HELD', seal_number: 'SEAL-S38-HELD' } });
  const n = (await q(`SELECT entry_no::int AS n FROM h1_register h JOIN order_items oi ON oi.id = h.order_item_id WHERE oi.shipment_id = $1`, [shared.heldPartnerShipment]))[0]?.n;
  check('the held parcel dispatches after the resume, as entry 6 of the partner\'s register', r.status === 200 && n === 6, { status: r.status, n, msg: r.json.message });

  const trail = await q(`SELECT action, performed_by, new_value, old_value FROM audit_logs WHERE action IN ('rx_sales_paused', 'rx_sales_resumed') AND performed_by = $1 ORDER BY chain_seq`, [ids.admin]);
  check('pause and resume are both audited, by the super-admin, with reason and reference', trail.map((x) => x.action).join() === 'rx_sales_paused,rx_sales_resumed'
    && trail[0].new_value.reference === 'GSR S38(E)' && trail[1].old_value.reason === body.reason, trail);
  await cart(t.buyer, P.rx, 0);
  await cart(t.buyer, P.otc, 0);
}
