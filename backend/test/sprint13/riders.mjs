// Dawabag's own riders: assignment, run sheet, least access (C-26, C-41)
import { call, check, q } from '../sprint5/lib.mjs';
import { packedOrder } from './fixtures.mjs';

export async function runRiders(ctx) {
  const { t, ids } = ctx;
  console.log('Riders');
  let r = await call('GET', '/fulfilment/riders', { token: t.packer });
  check('packers see the riders to choose from', r.status === 200 && [ids.rider1, ids.rider2].every((id) => r.json.data.some((x) => x.id === id)), r.json);
  const a = await packedOrder(ctx);
  const dispatch = (body) => call('POST', `/fulfilment/shipments/${a.shipmentId}/dispatch`, { token: t.packer, body: { seal_number: 'SEAL-S13-1', ...body } });
  r = await dispatch({ rider_id: ids.rider1, courier_partner: 'Delhivery', awb_number: 'X123' });
  check('a rider or a courier, not both', r.status === 400, r.json);
  r = await dispatch({ rider_id: ids.buyer });
  check('only delivery staff can be riders', r.status === 404, r.json);
  await q(`UPDATE order_shipments SET courier_provider = 'shiprocket:booking' WHERE id = $1`, [a.shipmentId]);
  r = await dispatch({ rider_id: ids.rider1 });
  check('no rider dispatch while a courier booking is in flight', r.status === 409 && /booking/.test(r.json.message), r.json);
  await q(`UPDATE order_shipments SET courier_provider = NULL WHERE id = $1`, [a.shipmentId]);
  r = await dispatch({ rider_id: ids.rider1 });
  const sh = (await q(`SELECT courier_partner, awb_number, rider_id, status FROM order_shipments WHERE id = $1`, [a.shipmentId]))[0];
  check('dispatched with a rider and a run reference', r.status === 200 && sh.courier_partner === 'Dawabag rider' && /^DWR\d{7}$/.test(sh.awb_number) && sh.rider_id === ids.rider1, { r: r.json, sh });
  check('…and the reference comes back with the dispatch', r.json.data?.awb_number === sh.awb_number && r.json.data?.courier_partner === 'Dawabag rider', r.json.data);
  r = await call('GET', '/fulfilment/queue?stage=deliver', { token: t.packer });
  check('packers see the delivery queue to reassign riders', r.status === 200 && r.json.data.items.some((x) => x.shipment_id === a.shipmentId), r.status);

  r = await call('GET', '/fulfilment/my-run', { token: t.rider1 });
  const row = r.json.data?.find((x) => x.shipment_id === a.shipmentId);
  check("rider's run sheet: where, to whom, seal, code needed", row && row.address.includes('13 Lake Road') && row.contact_mobile === '9000001399' && row.seal_number === 'SEAL-S13-1', row);
  check('…never which medicines are inside (C-41)', !JSON.stringify(r.json).includes('Antacid'), Object.keys(row || {}));
  r = await call('GET', '/fulfilment/queue?stage=deliver', { token: t.rider2 });
  check("another rider's queue does not show this parcel", r.status === 200 && !r.json.data.items.some((x) => x.shipment_id === a.shipmentId), r.json.data);
  r = await call('GET', `/orders/${a.order.id}`, { token: t.rider1 });
  check('riders cannot open orders', r.status === 404, r.status);
  r = await call('GET', `/invoices/shipments/${a.shipmentId}.pdf`, { token: t.rider2, raw: true });
  check("…nor another rider's invoice", r.status === 404, r.status);
  r = await call('GET', `/invoices/shipments/${a.shipmentId}.pdf`, { token: t.rider1, raw: true });
  check('…nor the carrying rider: invoices name the medicines (C-41)', r.status === 404, r.status);
  r = await call('GET', '/orders/queue', { token: t.rider1 });
  check('riders cannot list orders', r.status === 403, r.status);
  r = await call('POST', `/fulfilment/shipments/${a.shipmentId}/delivered`, { token: t.rider2, body: { received_by_name: 'S13 Buyer', received_by_relation: 'self' } });
  check("a rider cannot close another rider's parcel", r.status === 404, r.json);

  r = await call('POST', `/fulfilment/shipments/${a.shipmentId}/rider`, { token: t.rider1, body: { rider_id: ids.rider2 } });
  check('riders cannot reassign parcels', r.status === 403, r.status);
  r = await call('POST', `/fulfilment/shipments/${a.shipmentId}/rider`, { token: t.packer, body: { rider_id: ids.rider2 } });
  check('the parcel is handed to another rider', r.status === 200, r.json);
  r = await call('GET', '/fulfilment/my-run', { token: t.rider1 });
  check('…it leaves the first run sheet', !r.json.data.some((x) => x.shipment_id === a.shipmentId), r.json.data);
  r = await call('POST', `/fulfilment/shipments/${a.shipmentId}/delivered`, { token: t.rider2, body: { received_by_name: 'S13 Buyer', received_by_relation: 'self' } });
  check('the assigned rider hands it over', r.status === 200, r.json);
  r = await call('POST', `/fulfilment/shipments/${a.shipmentId}/rider`, { token: t.packer, body: { rider_id: ids.rider1 } });
  check('a delivered parcel cannot be reassigned', r.status === 409, r.json);
}
