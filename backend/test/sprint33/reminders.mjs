// Sprint 33 — "My medicines" dose reminders: the schedule and the Taken / Skipped answers
// live on the server; suggestions come from delivered orders; each buyer sees only their own.
import { call, check, q } from '../sprint5/lib.mjs';
import { P, deliveredOrder, t } from './fixtures.mjs';

const istNow = () => new Date(Date.now() + 330 * 60_000);
const hhmm = (d) => d.toISOString().slice(11, 16);

export async function runReminders() {
  console.log('\nDose reminders');
  let r = await call('GET', '/reminders');
  check('needs sign-in', r.status === 401, r.status);
  r = await call('GET', '/reminders', { token: t.buyer });
  check('none yet', r.status === 200 && r.json.data?.length === 0, r.json);
  r = await call('POST', '/reminders', { token: t.buyer, body: { medicine_name: 'S33 Vitamin D', times: ['25:00'] } });
  check('a time that does not exist is refused in plain words', r.status === 400 && /not a time of day/.test(r.json.message), r.json);
  r = await call('POST', '/reminders', { token: t.buyer, body: { medicine_name: 'S33 Vitamin D', times: ['08:00'], start_date: '2026-10-10', end_date: '2026-10-01' } });
  check('an end date before the start is refused', r.status === 400 && /end date/.test(r.json.message), r.json);

  // a dose 1 hour ago today (IST) so a Taken tap is due; skip the test edge right after midnight
  const now = istNow();
  const earlier = hhmm(new Date(now.getTime() - 60 * 60_000));
  const sameDay = now.getUTCHours() >= 1;
  r = await call('POST', '/reminders', { token: t.buyer, body: { medicine_name: 'S33 Vitamin D', dose: '1 capsule', times: ['21:30', earlier, '8:00'] } });
  const rem = r.json.data;
  check('added by hand: times sorted, today onwards, kept on the server', r.status === 201 && rem?.source === 'manual'
    && JSON.stringify(rem.times) === JSON.stringify([...new Set(['21:30', earlier, '08:00'])].sort()), rem);
  r = await call('GET', '/reminders', { token: t.buyer });
  const listed = (r.json.data ?? []).find((x) => x.id === rem?.id);
  check('the list shows today’s doses with no answer yet', !!listed && listed.today.length === rem.times.length
    && listed.today.every((d) => d.status === null), listed);
  r = await call('GET', '/reminders/upcoming?hours=48', { token: t.buyer });
  const up = r.json.data ?? [];
  check('upcoming doses for the phone’s alerts: in order, only future ones, within 48 h', r.status === 200 && up.length >= 4
    && up.every((d, i) => i === 0 || up[i - 1].scheduled_for <= d.scheduled_for)
    && up.every((d) => Date.parse(d.scheduled_for) > Date.now() && Date.parse(d.scheduled_for) <= Date.now() + 48 * 3_600_000), up);

  const due = listed?.today.find((d) => d.time === earlier);
  r = await call('POST', `/reminders/${rem.id}/doses`, { token: t.buyer, body: { scheduled_for: new Date(Date.parse(due?.scheduled_for) + 60_000).toISOString(), status: 'taken' } });
  check('a tap must name a real dose time', r.status === 400 && /dose times/.test(r.json.message), r.json);
  const later = new Date(Date.now() + 3 * 86_400_000);
  const futureDose = (await call('GET', '/reminders/upcoming?hours=168', { token: t.buyer })).json.data.find((d) => Date.parse(d.scheduled_for) > later.getTime());
  r = await call('POST', `/reminders/${rem.id}/doses`, { token: t.buyer, body: { scheduled_for: futureDose?.scheduled_for, status: 'taken' } });
  check('a dose days ahead cannot be marked yet', r.status === 400 && /not due yet/.test(r.json.message), r.json);
  if (sameDay) {
    r = await call('POST', `/reminders/${rem.id}/doses`, { token: t.buyer, body: { scheduled_for: due.scheduled_for, status: 'taken' } });
    check('Taken is sent to the server', r.status === 200 && r.json.data?.status === 'taken', r.json);
    r = await call('POST', `/reminders/${rem.id}/doses`, { token: t.buyer, body: { scheduled_for: due.scheduled_for, status: 'skipped' } });
    check('a second tap replaces the answer (one per dose)', r.status === 200 && r.json.data?.status === 'skipped', r.json);
    const logs = await q('SELECT status FROM reminder_dose_logs WHERE reminder_id = $1', [rem.id]);
    check('… stored once', logs.length === 1 && logs[0].status === 'skipped', logs);
    r = await call('GET', '/reminders', { token: t.buyer });
    const again = (r.json.data ?? []).find((x) => x.id === rem.id);
    check('the list shows the answer and counts it in the last 7 days', again?.today.find((d) => d.time === earlier)?.status === 'skipped'
      && again.last_7_days.skipped === 1, again);
  }

  console.log('\nOnly your own reminders');
  r = await call('PATCH', `/reminders/${rem.id}`, { token: t.other, body: { is_active: false } });
  check('another buyer cannot change it', r.status === 404, r.status);
  r = await call('POST', `/reminders/${rem.id}/doses`, { token: t.other, body: { scheduled_for: due?.scheduled_for, status: 'taken' } });
  check('… or answer for it', r.status === 404, r.status);
  r = await call('GET', '/reminders', { token: t.other });
  check('… or see it', r.json.data?.length === 0, r.json.data);
  r = await call('PATCH', `/reminders/${rem.id}`, { token: t.buyer, body: { is_active: false, times: ['09:00'] } });
  check('paused and time changed', r.status === 200 && r.json.data?.is_active === false && JSON.stringify(r.json.data.times) === '["09:00"]', r.json.data);
  r = await call('GET', '/reminders/upcoming', { token: t.buyer });
  check('a paused reminder gives no phone alerts', !(r.json.data ?? []).some((d) => d.reminder_id === rem.id), r.json.data);

  console.log('\nFrom past orders');
  r = await call('GET', '/reminders/suggestions', { token: t.buyer });
  check('no delivered orders → no suggestions', r.status === 200 && r.json.data?.length === 0, r.json.data);
  const order = await deliveredOrder([{ product_id: P.perTab, quantity: 1 }]);
  check('a delivered order', !!order.id, order.response?.json);
  r = await call('GET', '/reminders/suggestions', { token: t.buyer });
  const sug = (r.json.data ?? []).find((s) => s.product_id === P.perTab);
  check('its medicine is suggested', !!sug && sug.order_id === order.id, r.json.data);
  r = await call('POST', '/reminders', { token: t.other, body: { medicine_name: 'x medicine', times: ['08:00'], product_id: P.perTab, order_id: order.id } });
  check('another buyer cannot use that order', r.status === 400 && /not yours/.test(r.json.message), r.json);
  r = await call('POST', '/reminders', { token: t.buyer, body: { medicine_name: sug?.medicine_name, product_id: P.perTab, order_id: order.id, times: ['07:30', '19:30'] } });
  check('reminder from the order', r.status === 201 && r.json.data?.source === 'order' && r.json.data.product_id === P.perTab, r.json);
  const fromOrder = r.json.data;
  r = await call('GET', '/reminders/suggestions', { token: t.buyer });
  check('no longer suggested', !(r.json.data ?? []).some((s) => s.product_id === P.perTab), r.json.data);
  r = await call('GET', '/privacy/export', { token: t.buyer });
  const exported = r.json.data?.medicine_reminders ?? r.json.medicine_reminders;
  check('included in “Download my data” (C-43)', Array.isArray(exported) && exported.length === 2, r.status);
  r = await call('DELETE', `/reminders/${fromOrder.id}`, { token: t.buyer });
  check('deleted', r.status === 200, r.json);
  r = await call('DELETE', `/reminders/${rem.id}`, { token: t.buyer });
  const left = await q('SELECT COUNT(*)::int AS n FROM reminder_dose_logs WHERE reminder_id = $1', [rem.id]);
  check('deleting removes its answers too', r.status === 200 && left[0].n === 0, left);
}
