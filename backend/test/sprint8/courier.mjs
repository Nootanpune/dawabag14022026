// Shiprocket booking, the tracking webhook and the buyer's tracking timeline
import { API, call, check, q } from '../sprint5/lib.mjs';
import { calls } from './fakes.mjs';
import { paidOrder, waitFor } from './fixtures.mjs';

const hook = (body, key = process.env.SHIPROCKET_WEBHOOK_TOKEN) => fetch(`${API}/courier/shiprocket/webhook`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(key ? { 'x-api-key': key } : {}) }, body: JSON.stringify(body),
}).then(async (res) => ({ status: res.status, json: await res.json().catch(() => ({})) }));
const ship = async (id) => (await q(`SELECT status, awb_number, courier_partner, courier_provider, tracking_status, rto_at, delivered_at, received_by_name
                                      FROM order_shipments WHERE id = $1`, [id]))[0];

export async function runCourier(ctx, a) {
  const { t, ids } = ctx;
  console.log('Courier booking (Shiprocket)');
  let r = await call('POST', `/fulfilment/shipments/${a.shipmentId}/book-courier`, { token: t.packer });
  check('booking refused while the courier setting is manual', r.status === 409, r.json);
  await call('PUT', '/admin/settings/courier.provider', { token: t.admin, body: { value: 'shiprocket' } });
  const b = await paidOrder(ctx);
  r = await call('POST', `/fulfilment/shipments/${b.shipmentId}/book-courier`, { token: t.packer });
  check('booking refused before packing', r.status === 409, r.json);
  r = await call('POST', `/fulfilment/shipments/${a.shipmentId}/book-courier`, { token: t.buyer });
  check('buyers cannot book couriers', r.status === 403, r.status);
  r = await call('POST', `/fulfilment/shipments/${a.shipmentId}/book-courier`, { token: t.packer });
  const awb = r.json.data?.awb_number;
  check('packed shipment booked; AWB and courier stored', r.status === 200 && /^S8AWB/.test(awb || '') && r.json.data.courier_partner === 'Delhivery Surface', r.json);
  const created = calls('/orders/create/adhoc').map((x) => JSON.parse(x.body));
  check('courier sees "Pharmacy items", never the medicine names (C-41)', created.length === 1
    && created[0].order_items.every((i) => i.name === 'Pharmacy items') && !JSON.stringify(created[0]).includes('Pain Relief'), created[0]?.order_items);
  r = await call('POST', `/fulfilment/shipments/${a.shipmentId}/book-courier`, { token: t.packer });
  check('a shipment is booked only once', r.status === 409, r.json);
  check('Shiprocket login cached in memory and reused', calls('/auth/login').length <= 1 && calls('/auth/login').every((x) => x.status === 200), calls('/auth/login').length);

  r = await call('POST', `/fulfilment/shipments/${a.shipmentId}/dispatch`, { token: t.packer, body: { seal_number: 'SEAL-S8-1' } });
  let s = await ship(a.shipmentId);
  check('dispatch uses the booked courier and AWB', r.status === 200 && s.status === 'dispatched' && s.awb_number === awb && s.courier_provider === 'shiprocket', { r: r.json, s });
  const dsms = await waitFor(`SELECT status, provider_ref FROM notification_deliveries WHERE user_id = $1 AND type = 'dispatched' AND channel = 'sms'`, [ids.buyer]);
  check('dispatch SMS sent through the registered DLT template', dsms[0]?.status === 'sent' && /^msg91-req/.test(dsms[0].provider_ref || ''), dsms);
  const flow = calls('/api/v5/flow/').map((x) => JSON.parse(x.body));
  const d = flow.find((f) => f.template_id === 'TPL-S8-DISPATCH');
  check('MSG91 got the template id and only its variables', d && d.recipients[0].mobiles === '919000000803' && d.recipients[0].AWB === awb
    && d.recipients[0].ORDER === a.order.order_number && Object.keys(d.recipients[0]).length === 3, d);

  console.log('Tracking webhook');
  r = await hook({ awb, current_status: 'PICKED UP' }, null);
  check('webhook without the token refused', r.status === 401, r.json);
  r = await hook({ awb, current_status: 'PICKED UP' }, 'x'.repeat(32));
  check('webhook with a wrong token refused', r.status === 401, r.json);
  r = await hook({ awb: 'NOSUCHAWB', current_status: 'PICKED UP' });
  check('unknown AWB acknowledged and ignored', r.status === 200 && r.json.ignored === 'unknown AWB', r.json);
  r = await hook({ hello: 'world' });
  check('junk payload acknowledged so the courier does not retry', r.status === 200 && r.json.ignored, r.json);
  // Shiprocket style: Indian time, no zone, a few seconds after booking
  const base = Date.now();
  const ts = (sec) => new Date(base + sec * 1000 + 5.5 * 3600e3).toISOString().slice(0, 19).replace('T', ' ');
  r = await hook({ awb, current_status: 'PICKED UP', current_timestamp: ts(1), scans: [{ location: 'Nashik Hub' }] });
  check('pick-up recorded', r.json.status === 'picked_up', r.json);
  const ev = (await q(`SELECT event_time FROM shipment_tracking_events WHERE shipment_id = $1 AND status = 'picked_up'`, [a.shipmentId]))[0];
  check('zone-less courier time read as IST', ev && Math.abs(new Date(ev.event_time).getTime() - (base + 1000)) < 1500, ev);
  const ofd = { awb, current_status: 'OUT FOR DELIVERY', current_timestamp: ts(2), scans: [{ location: 'Nashik Road DC' }] };
  r = await hook(ofd);
  check('out for delivery recorded', r.json.status === 'out_for_delivery', r.json);
  r = await hook(ofd);
  check('a repeated scan is ignored', r.json.duplicate === true, r.json);
  const ofdSms = await waitFor(`SELECT status FROM notification_deliveries WHERE user_id = $1 AND type = 'out_for_delivery' AND channel = 'sms'`, [ids.buyer]);
  check('buyer told the parcel is out for delivery', ofdSms[0]?.status === 'sent', ofdSms);
  r = await hook({ awb, current_status: 'DELIVERED', current_timestamp: ts(3) });
  s = await ship(a.shipmentId);
  check('courier delivery closes a non-prescription shipment', s.status === 'delivered' && s.delivered_at && s.received_by_name === 'Courier delivery', s);

  r = await call('GET', `/orders/${a.order.id}`, { token: t.buyer });
  const sh = r.json.data?.shipments?.[0];
  check('buyer sees the tracking timeline in order', sh?.tracking_status === 'delivered'
    && sh.tracking.map((e) => e.status).join() === 'booked,picked_up,out_for_delivery,delivered' && sh.tracking[1].location === 'Nashik Hub', sh?.tracking);

  console.log('Prescription parcel and return to origin');
  await call('PUT', '/admin/settings/delivery.handover_code_scope', { token: t.admin, body: { value: 'all' } });
  await call('POST', `/fulfilment/shipments/${b.shipmentId}/pack`, { token: t.packer });
  r = await call('POST', `/fulfilment/shipments/${b.shipmentId}/book-courier`, { token: t.packer });
  const awbB = r.json.data?.awb_number;
  await call('POST', `/fulfilment/shipments/${b.shipmentId}/dispatch`, { token: t.packer, body: { seal_number: 'SEAL-S8-2' } });
  await call('PUT', '/admin/settings/delivery.handover_code_scope', { token: t.admin, body: { value: 'rx_only' } });
  r = await hook({ awb: awbB, current_status: 'DELIVERED' });
  s = await ship(b.shipmentId);
  check('a courier "delivered" scan does not close a code-protected parcel (C-26)', s.status === 'dispatched' && s.tracking_status === 'delivered', s);
  const rxAlert = await waitFor(`SELECT 1 FROM notifications WHERE user_id = $1 AND type = 'courier_rx_delivered' AND data->>'awbNumber' = $2`, [ids.admin, awbB]);
  check('admins alerted to confirm the handover', rxAlert.length === 1, rxAlert);

  const c = await paidOrder(ctx);
  await call('POST', `/fulfilment/shipments/${c.shipmentId}/pack`, { token: t.packer });
  r = await call('POST', `/fulfilment/shipments/${c.shipmentId}/book-courier`, { token: t.packer });
  const awbC = r.json.data?.awb_number;
  r = await call('POST', `/fulfilment/shipments/${c.shipmentId}/dispatch`, { token: t.packer, body: { courier_partner: 'Other', awb_number: 'OVERRIDE1', seal_number: 'SEAL-S8-3' } });
  s = await ship(c.shipmentId);
  check('a typed courier and AWB at dispatch override the booking', r.status === 200 && s.awb_number === 'OVERRIDE1', s);
  await q(`UPDATE order_shipments SET awb_number = $2 WHERE id = $1`, [c.shipmentId, awbC]);
  r = await hook({ awb: awbC, current_status: 'RTO INITIATED' });
  s = await ship(c.shipmentId);
  check('return to origin recorded', r.json.status === 'rto' && s.rto_at && s.tracking_status === 'rto', s);
  const rto = await waitFor(`SELECT 1 FROM notifications WHERE user_id = $1 AND type = 'courier_rto' AND data->>'awbNumber' = $2`, [ids.admin, awbC]);
  check('admins alerted to the returning parcel', rto.length === 1, rto);
  const dup = await q(`SELECT COUNT(*)::int AS n FROM notifications WHERE type = 'courier_rto' AND data->>'awbNumber' = $1`, [awbC]);
  await hook({ awb: awbC, current_status: 'RTO INITIATED' });
  check('repeated RTO scan does not alert again', (await q(`SELECT COUNT(*)::int AS n FROM notifications WHERE type = 'courier_rto' AND data->>'awbNumber' = $1`, [awbC]))[0].n === dup[0].n);
}
