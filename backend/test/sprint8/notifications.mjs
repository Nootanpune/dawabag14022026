// Push devices, DLT SMS, FCM v1 and the delivery log
import { call, check, q } from '../sprint5/lib.mjs';
import { calls } from './fakes.mjs';
import { paidOrder, waitFor } from './fixtures.mjs';

const GOOD = 'good-device-token-s8-0000000000000001';
const DEAD = 'dead-device-token-s8-0000000000000002';

export async function runNotifications(ctx) {
  const { t, ids } = ctx;
  console.log('Push devices');
  let r = await call('POST', '/users/me/devices', { token: t.buyer, body: { token: 'short', platform: 'android' } });
  check('a malformed device token is refused', r.status === 422, r.json);
  r = await call('POST', '/users/me/devices', { token: t.buyer, body: { token: GOOD, platform: 'android' } });
  check('buyer registers a phone', r.status === 200, r.json);
  r = await call('PATCH', '/users/me/fcm-token', { token: t.buyer, body: { fcm_token: DEAD } });
  check('older apps register through PATCH fcm-token', r.status === 200, r.json);
  r = await call('POST', '/users/me/devices', { token: t.buyer, body: { token: GOOD, platform: 'android' } });
  const mine = await q(`SELECT fcm_token FROM user_devices WHERE user_id = $1`, [ids.buyer]);
  check('several devices per buyer, no duplicates', mine.length === 2, mine);
  const shared = 'moved-device-token-s8-00000000000000003';
  await call('POST', '/users/me/devices', { token: t.buyer2, body: { token: shared } });
  await call('POST', '/users/me/devices', { token: t.buyer, body: { token: shared } });
  const owner = (await q(`SELECT user_id FROM user_devices WHERE fcm_token = $1`, [shared]))[0]?.user_id;
  check('a token used by another account moves to the account now signed in', owner === ids.buyer, owner);
  r = await call('DELETE', '/users/me/devices', { token: t.buyer2, body: { token: shared } });
  check("removing someone else's device does nothing", (await q(`SELECT 1 FROM user_devices WHERE fcm_token = $1`, [shared])).length === 1);
  await call('DELETE', '/users/me/devices', { token: t.buyer, body: { token: shared } });
  check('buyer removes a device', (await q(`SELECT 1 FROM user_devices WHERE fcm_token = $1`, [shared])).length === 0);

  console.log('DLT SMS templates (TRAI) and FCM v1');
  r = await call('PUT', '/admin/settings/sms.dlt_templates', { token: t.admin, body: { value: {
    dispatched: { template_id: 'TPL-S8-DISPATCH', vars: { ORDER: 'order_number', AWB: 'awb' } },
    out_for_delivery: { template_id: 'TPL-S8-OFD', vars: { ORDER: 'order_number' } },
  } } });
  check('admin registers DLT templates', r.status === 200, r.json);

  const a = await paidOrder(ctx);
  r = await call('POST', `/fulfilment/shipments/${a.shipmentId}/pack`, { token: t.packer });
  check('packed', r.status === 200, r.json);
  const packed = await waitFor(`SELECT channel, status, detail, provider_ref FROM notification_deliveries WHERE user_id = $1 AND type = 'order_status'`, [ids.buyer],
    (rows) => rows.some((x) => x.channel === 'sms') && rows.filter((x) => x.channel === 'push').length >= 2);
  const sms = packed.find((x) => x.channel === 'sms');
  check('no DLT template for the packing update: SMS skipped with the reason, never sent as free text', sms?.status === 'skipped' && /No DLT template/.test(sms.detail), packed);
  const push = packed.filter((x) => x.channel === 'push');
  check('push sent through FCM v1 to the live phone', push.some((x) => x.status === 'sent' && /messages/.test(x.provider_ref || '')), push);
  check('push to an uninstalled app logged as failed', push.some((x) => x.status === 'failed' && /UNREGISTERED/.test(x.detail || '')), push);
  const left = (await q(`SELECT fcm_token FROM user_devices WHERE user_id = $1`, [ids.buyer])).map((x) => x.fcm_token);
  check('the unregistered token is removed', left.length === 1 && left[0] === GOOD, left);
  const tok = calls('/token');
  // The API caches the access token for an hour, so a re-run may not exchange again
  check('service-account JWT accepted (signature checked by the fake); token reused', tok.length <= 1 && tok.every((x) => x.status === 200), tok.map((x) => x.status));
  const sent = calls('/messages:send').map((x) => JSON.parse(x.body).message);
  check('push carries only ids and the type, no personal data', sent.length >= 2 && sent.every((m) => Object.keys(m.data).every((k) => ['type', 'order_id'].includes(k))), sent[0]);
  check('nothing about the order went to SMS for the packing update', calls('/api/v5/flow/').length === 0);

  r = await call('GET', '/admin/notification-deliveries?status=failed&channel=push', { token: t.admin });
  check('admin delivery log lists the failed push', r.status === 200 && r.json.data.deliveries.some((d) => d.type === 'order_status' && d.user_name === 'S8 Buyer')
    && Array.isArray(r.json.data.last_7_days), r.json.data?.deliveries?.slice?.(0, 2));
  r = await call('GET', '/admin/notification-deliveries', { token: t.buyer });
  check('buyers cannot read the delivery log', r.status === 403, r.status);
  r = await call('GET', '/admin/notification-deliveries?status=lost', { token: t.admin });
  check('unknown filter refused', r.status === 422, r.status);
  return a;
}

export async function runLogout(ctx) {
  const { t, ids } = ctx;
  console.log('Sign-out forgets the phone');
  const r = await call('POST', '/auth/logout', { token: t.buyer, body: { fcm_token: GOOD } });
  const left = await q(`SELECT 1 FROM user_devices WHERE user_id = $1`, [ids.buyer]);
  check('logout with the device token removes it', r.status === 200 && left.length === 0, { r: r.json, left });
}
