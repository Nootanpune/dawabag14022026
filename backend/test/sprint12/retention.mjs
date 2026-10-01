// Storage limitation: operational data deleted after its retention period (DPDP s.8(7), C-44)
import { call, check, q } from '../sprint5/lib.mjs';

export async function runRetention({ t, ids }) {
  console.log('Retention purge');
  const P = ids.buyer;
  const ago = (d) => `NOW() - INTERVAL '${d} days'`;
  await q(`INSERT INTO notification_deliveries (user_id, type, channel, status, created_at) VALUES ($1, 's12_old', 'sms', 'sent', ${ago(400)}), ($1, 's12_new', 'sms', 'sent', ${ago(10)})`, [P]);
  await q(`INSERT INTO job_runs (job_name, status, started_at) VALUES ('s12_old_job', 'succeeded', ${ago(400)}), ('s12_old_job', 'succeeded', ${ago(5)})`);
  await q(`INSERT INTO payment_webhook_events (event_id, event, received_at) VALUES ('evt_s12_old', 'payment.captured', ${ago(800)}), ('evt_s12_new', 'payment.captured', ${ago(100)})`);
  await q(`INSERT INTO user_devices (user_id, fcm_token, platform, last_seen_at) VALUES ($1, 's12-stale-device-token-000000000001', 'android', ${ago(200)}),
           ($1, 's12-fresh-device-token-000000000002', 'android', ${ago(2)})`, [P]);
  const product = (await q(`SELECT id FROM products WHERE is_active LIMIT 1`))[0]?.id;
  await q(`INSERT INTO carts (user_id, updated_at) VALUES ($1, ${ago(120)}) ON CONFLICT (user_id) DO UPDATE SET updated_at = ${ago(120)}`, [P]);
  if (product) await q(`INSERT INTO cart_items (user_id, product_id, quantity) VALUES ($1, $2, 1) ON CONFLICT DO NOTHING`, [P, product]);

  let r = await call('PUT', '/admin/settings/retention.days', { token: t.admin, body: { value: { notification_deliveries: 5, notifications: 365, payment_webhook_events: 730, job_runs: 365, abandoned_carts: 90, stale_devices: 180 } } });
  check('retention shorter than 30 days refused', r.status === 422, r.status);
  r = await call('PUT', '/admin/settings/retention.days', { token: t.admin, body: { value: { notification_deliveries: 365, notifications: 365, payment_webhook_events: 100, job_runs: 365, abandoned_carts: 90, stale_devices: 180 } } });
  check('payment webhook records kept at least 180 days', r.status === 422, r.status);

  r = await call('POST', '/admin/jobs/retention_purge/run', { token: t.buyer });
  check('only super admins run jobs', r.status === 403, r.status);
  r = await call('POST', '/admin/jobs/retention_purge/run', { token: t.admin });
  check('purge job runs', r.status === 200 && r.json.data?.status === 'succeeded', r.json);
  const types = (await q(`SELECT type FROM notification_deliveries WHERE user_id = $1`, [P])).map((x) => x.type);
  check('delivery log: past 365 days deleted, recent kept', !types.includes('s12_old') && types.includes('s12_new'), types);
  const jobs = await q(`SELECT started_at FROM job_runs WHERE job_name = 's12_old_job'`);
  check('job history past 365 days deleted', jobs.length === 1, jobs.length);
  const evs = (await q(`SELECT event_id FROM payment_webhook_events WHERE event_id LIKE 'evt_s12_%'`)).map((x) => x.event_id);
  check('webhook records past 730 days deleted', evs.join() === 'evt_s12_new', evs);
  const devs = (await q(`SELECT fcm_token FROM user_devices WHERE user_id = $1`, [P])).map((x) => x.fcm_token);
  check('phones unseen for 180 days forgotten', devs.length === 1 && devs[0].startsWith('s12-fresh'), devs);
  const cart = await q(`SELECT 1 FROM cart_items WHERE user_id = $1`, [P]);
  check('a cart untouched for 90 days is emptied', cart.length === 0, cart.length);
  const audit = (await q(`SELECT new_value FROM audit_logs WHERE action = 'retention_purge' ORDER BY created_at DESC LIMIT 1`))[0];
  check('each purge is audited with counts', audit?.new_value?.deleted?.notification_deliveries >= 1, audit);
}
