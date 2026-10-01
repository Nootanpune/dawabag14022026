// WhatsApp order updates, only for buyers who opted in
import { call, check, q } from '../sprint5/lib.mjs';
import { calls } from '../fakes/server.mjs';
import { packedOrder, waitFor } from './fixtures.mjs';

export async function runWhatsApp(ctx) {
  const { t, ids } = ctx;
  console.log('WhatsApp');
  let r = await call('PUT', '/admin/settings/whatsapp.templates', { token: t.admin, body: { value: { dispatched: { name: 'order dispatched', language: 'en' } } } });
  check('template names are validated', r.status === 422, r.status);
  r = await call('PUT', '/admin/settings/whatsapp.templates', { token: t.admin, body: { value: { dispatched: { name: 'order_dispatched', language: 'en', vars: ['order_number', 'awb'] } } } });
  check('admin maps the approved template', r.status === 200, r.json);
  const send = async () => {
    const a = await packedOrder(ctx);
    await call('POST', `/fulfilment/shipments/${a.shipmentId}/dispatch`, { token: t.packer, body: { seal_number: 'SEAL-S13-W', rider_id: ids.rider1 } });
    await waitFor(`SELECT 1 FROM notification_deliveries WHERE user_id = $1 AND type = 'dispatched' AND channel = 'sms' AND notification_id IN
                   (SELECT id FROM notifications WHERE data->>'orderId' = $2)`, [ids.buyer, a.order.id]);
    return a;
  };
  const before = calls('/whatsapp-outbound-message/').length;
  await send();
  check('no WhatsApp without the buyer opting in', calls('/whatsapp-outbound-message/').length === before);
  r = await call('PUT', '/privacy/consents/whatsapp', { token: t.buyer, body: { granted: true } });
  check('buyer opts in to WhatsApp updates', r.status === 200, r.json);
  const a = await send();
  const wa = await waitFor(`SELECT status, provider_ref FROM notification_deliveries WHERE user_id = $1 AND channel = 'whatsapp'`, [ids.buyer]);
  const body = JSON.parse(calls('/whatsapp-outbound-message/').slice(-1)[0]?.body || '{}');
  const tpl = body.payload?.template;
  check('dispatch update sent on WhatsApp with the approved template and logged', wa[0]?.status === 'sent' && tpl?.name === 'order_dispatched'
    && tpl.to_and_components[0].to[0] === '919000001305' && tpl.to_and_components[0].components.body_1.value === a.order.order_number, { wa, tpl });
  await call('PUT', '/privacy/consents/whatsapp', { token: t.buyer, body: { granted: false } });
  const n = calls('/whatsapp-outbound-message/').length;
  await send();
  check('opting out stops WhatsApp at once', calls('/whatsapp-outbound-message/').length === n);
}
