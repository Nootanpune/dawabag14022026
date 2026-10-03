// Sprint 39 — pharmacist registration validity (handover D10; C-03, C-08, C-46): an
// unverified, lapsed, expired or suspended registration blocks prescription verification,
// the per-order pharmacist check, a partner's shipment release and medicine-information
// approval. Admins record and verify; pharmacists working before Sprint 39 carry on with
// a warning until recorded; reminders 30 days before.
import { call, check, q } from '../sprint5/lib.mjs';
import { P, V, ids, inDays, permit, placeOrder, rxBody, rxOf, shipmentsOf, t, verifyStaff } from './fixtures.mjs';
import { waitFor } from './rxPayment.mjs';

const INVALID = 'PHARMACIST_REGISTRATION_INVALID';
const putStaff = (userId, body, token = t.opsAdmin) => call('PUT', `/pharmacist-registrations/staff/${userId}`, { token, body });
const putPartner = (id, body, token = t.opsAdmin) => call('PUT', `/pharmacist-registrations/partner/${id}`, { token, body });
const content = (overview) => ({ overview, uses: ['Fever'], references: [{ source: 'Manufacturer’s package insert', date: 'March 2026' }] });

/** The four gates for one pharmacist login (and the partner gate separately). */
async function gates(token) {
  const { order } = await placeOrder([{ product_id: P.rx, quantity: 1 }]);
  await q(`UPDATE orders SET status = 'rx_pending' WHERE id = $1`, [order.id]);
  const rx = await rxOf(order.id);
  const verify = await call('POST', `/fulfilment/prescriptions/${rx}/verify`, { token, body: rxBody(P.rx, 1) });
  const otc = (await placeOrder([{ product_id: P.otc, quantity: 1 }], { withRx: false })).order;
  await q(`UPDATE orders SET status = 'confirmed' WHERE id = $1`, [otc.id]);
  const { own } = await shipmentsOf(otc.id);
  const release = await call('POST', `/fulfilment/shipments/${own}/check`, { token, body: { decision: 'release' } });
  await call('PUT', `/medicines/${P.otc}/info/draft`, { token: t.opsAdmin, body: { content: content(`S39 info ${Date.now()}`) } });
  await call('POST', `/medicines/${P.otc}/info/submit`, { token: t.opsAdmin });
  const info = await call('POST', `/medicines/${P.otc}/info/review`, { token, body: { approve: true, notes: 'Checked against the insert.' } });
  return { verify, release, info, orders: [order.id, otc.id] };
}
const cancelAll = async (orderIds) => { for (const id of orderIds) await call('POST', `/orders/${id}/cancel`, { token: t.buyer, body: { reason: 'S39 registration test' } }); };

export async function runRegistrations() {
  console.log('\nPharmacist registration validity (C-03): admins record and verify');
  let r = await call('GET', '/pharmacist-registrations', { token: t.opsAdmin });
  const row = r.json.data?.staff?.find((s) => s.user_id === ids.pharmacist);
  check('the admin sees every pharmacist with council, number, valid-till and where it stands', r.status === 200 && row?.state_council === 'Maharashtra State Pharmacy Council'
    && row.standing?.ok === true && row.standing.state === 'valid', row);
  r = await call('GET', '/pharmacist-registrations', { token: t.pharmacist });
  check('a pharmacist cannot open the admin list', r.status === 403, r.status);
  r = await putStaff(ids.pharmacistNew, { state_council: 'Maharashtra State Pharmacy Council', valid_till: inDays(-1), verified: true });
  check('an admin cannot verify a registration already past its valid-till', r.status === 400 && /lapsed/.test(r.json.message), r.json);
  r = await putStaff(ids.pharmacistNew, { valid_till: inDays(100), verified: true });
  check('verifying needs the council', r.status === 400 && /Council/.test(r.json.message), r.json);
  r = await putStaff(ids.pharmacistNew, { verified: true, state_council: 'MSPC' }, t.pharmacist);
  check('only an admin records registrations', r.status === 403, r.status);

  console.log('\nNo registration recorded → blocked at all four gates');
  let g = await gates(t.pharmacistNew);
  check('prescription verification refused (unrecorded)', g.verify.status === 403 && g.verify.json.code === INVALID && /not been recorded/.test(g.verify.json.message), g.verify.json);
  check('the order check (release) refused', g.release.status === 403 && g.release.json.code === INVALID, g.release.json);
  check('medicine-information approval refused', g.info.status === 403 && g.info.json.code === INVALID, g.info.json);
  r = await permit([P.otc], t.pharmacistNew);
  check('… and allowing a product for online sale refused', r.status === 403 && r.json.code === INVALID, r.json);
  await cancelAll(g.orders);

  r = await putStaff(ids.pharmacistNew, { state_council: 'Maharashtra State Pharmacy Council', registration_no: 'MSPC-S39-3', valid_till: inDays(400) });
  check('recorded but not verified yet', r.status === 200 && r.json.data?.verified === false && r.json.data.standing?.state === 'unverified', r.json);
  g = await gates(t.pharmacistNew);
  check('… still blocked (unverified)', g.verify.status === 403 && /not verified/.test(g.verify.json.message), g.verify.json);
  await cancelAll(g.orders);
  r = await putStaff(ids.pharmacistNew, { verified: true });
  check('the admin verifies it (after checking the council\'s register)', r.status === 200 && r.json.data?.verified === true && r.json.data.standing?.ok === true, r.json);
  const [aud] = await q(`SELECT performed_by, new_value FROM audit_logs WHERE action = 'pharmacist_registration_verified' AND user_id = $1 ORDER BY created_at DESC LIMIT 1`, [ids.pharmacistNew]);
  check('… audited with who verified it', aud?.performed_by === ids.opsAdmin && aud.new_value?.verified === true, aud);
  g = await gates(t.pharmacistNew);
  check('verified → the prescription verification goes through', g.verify.status === 200, g.verify.json);
  check('… the order check goes through', g.release.status === 200, g.release.json);
  check('… medicine information can be approved', g.info.status === 200, g.info.json);
  await cancelAll(g.orders);

  console.log('\nLapsed, expired or suspended → blocked again');
  r = await putStaff(ids.pharmacistNew, { status: 'lapsed', status_note: 'S39 test: renewal not received' });
  g = await gates(t.pharmacistNew);
  check('lapsed: prescription verification refused', g.verify.status === 403 && /lapsed/.test(g.verify.json.message), g.verify.json);
  check('lapsed: the order check refused', g.release.status === 403 && /lapsed/.test(g.release.json.message), g.release.json);
  check('lapsed: medicine-information approval refused', g.info.status === 403 && /lapsed/.test(g.info.json.message), g.info.json);
  await cancelAll(g.orders);
  await putStaff(ids.pharmacistNew, { status: 'active' });
  await q(`UPDATE pharmacist_registrations SET valid_till = CURRENT_DATE - 1 WHERE user_id = $1`, [ids.pharmacistNew]);
  g = await gates(t.pharmacistNew);
  check('past its valid-till: refused at all three staff gates', g.verify.status === 403 && /expired/.test(g.verify.json.message)
    && g.release.status === 403 && g.info.status === 403, [g.verify.json, g.release.json, g.info.json]);
  await cancelAll(g.orders);
  await q(`UPDATE pharmacist_registrations SET valid_till = CURRENT_DATE + 400 WHERE user_id = $1`, [ids.pharmacistNew]);
  await putStaff(ids.pharmacistNew, { status: 'suspended' });
  g = await gates(t.pharmacistNew);
  check('suspended: refused', g.verify.status === 403 && /suspended/.test(g.verify.json.message), g.verify.json);
  await cancelAll(g.orders);
  await q(`UPDATE users SET pharmacist_reg_no = 'MSPC-S39-CHANGED' WHERE id = $1`, [ids.pharmacist]);
  r = await permit([P.otc]);
  check('a login whose registration number changed since verification is blocked until re-verified', r.status === 403 && /changed/.test(r.json.message), r.json);
  await q(`UPDATE users SET pharmacist_reg_no = 'MSPC-S39-1' WHERE id = $1`, [ids.pharmacist]);

  console.log('\nPharmacists working before Sprint 39: carry on, with a warning to complete the record');
  await q(`UPDATE pharmacist_registrations SET verified_at = NULL, valid_till = NULL, state_council = NULL, recorded_before_sprint39 = TRUE,
             status = 'active' WHERE user_id = $1`, [ids.pharmacistNew]);
  r = await call('GET', '/pharmacist-registrations/me', { token: t.pharmacistNew });
  check('the pharmacist sees "not yet recorded" with what to do', r.status === 200 && r.json.data?.standing?.ok === true
    && r.json.data.standing.state === 'not_recorded' && /not yet recorded/.test(r.json.data.standing.message), r.json.data);
  g = await gates(t.pharmacistNew);
  check('… and is not blocked (non-breaking start)', g.verify.status === 200 && g.release.status === 200, [g.verify.json, g.release.json]);
  await cancelAll(g.orders);

  console.log('\nA partner\'s pharmacist: recorded by the admin; blocked when unverified or lapsed');
  const partnerGate = async () => {
    const { order } = await placeOrder([{ product_id: P.h1p, quantity: 1 }]);
    await q(`UPDATE orders SET status = 'rx_verified' WHERE id = $1`, [order.id]);
    await q(`UPDATE order_items SET prescription_id = (SELECT id FROM prescriptions WHERE order_id = $1 LIMIT 1) WHERE order_id = $1`, [order.id]);
    const { partner } = await shipmentsOf(order.id);
    const res = await call('POST', `/partner/shipments/${partner}/check`, { token: t.partner, body: { decision: 'release', vendor_pharmacist_id: V.pharmacist } });
    await q(`UPDATE order_items SET prescription_id = NULL WHERE order_id = $1`, [order.id]);
    return { res, order: order.id };
  };
  let pg = await partnerGate();
  check('a partner pharmacist added without council / validity cannot release', pg.res.status === 403 && pg.res.json.code === INVALID, pg.res.json);
  await cancelAll([pg.order]);
  r = await call('GET', '/partner/pharmacists', { token: t.partner });
  check('the partner portal shows why (registration standing per pharmacist)', r.json.data?.pharmacists?.[0]?.registration?.ok === false
    || r.json.data?.[0]?.registration?.ok === false, r.json.data);
  r = await putPartner(V.pharmacist, { registration_no: 'OTHER-NO' });
  check('the partner pharmacist\'s number cannot be changed (past register entries name it)', r.status === 400, r.json);
  r = await putPartner(V.pharmacist, { state_council: 'Maharashtra State Pharmacy Council', valid_till: inDays(25), verified: true });
  check('the admin records and verifies the partner\'s pharmacist', r.status === 200 && r.json.data?.verified === true, r.json);
  pg = await partnerGate();
  check('… now the partner\'s release goes through', pg.res.status === 200, pg.res.json);
  await cancelAll([pg.order]);
  await putPartner(V.pharmacist, { status: 'lapsed' });
  pg = await partnerGate();
  check('lapsed partner pharmacist: release refused', pg.res.status === 403 && /lapsed/.test(pg.res.json.message), pg.res.json);
  await cancelAll([pg.order]);
  await putPartner(V.pharmacist, { status: 'active' });

  console.log('\nReminders 30 days before (admins + the partner\'s owner), once');
  await q(`UPDATE pharmacist_registrations SET valid_till = CURRENT_DATE + 30, last_alert_days = NULL WHERE user_id = $1`, [ids.pharmacistB]);
  r = await call('POST', '/admin/jobs/pharmacist_registration_alerts/run', { token: t.admin });
  check('the reminder job runs', r.status === 200 && r.json.data?.summary?.alerted >= 2, r.json);
  const noted = (u, min = 1) => waitFor(async () => {
    const rows = await q(`SELECT 1 FROM notifications WHERE user_id = $1 AND type = 'pharmacist_registration_expiring'`, [u]);
    return rows.length >= min ? rows : [];
  });
  check('admins are told (staff pharmacist and partner pharmacist)', (await noted(ids.opsAdmin, 2)).length >= 2);
  check('the partner\'s owner is told about its pharmacist', (await noted(ids.partner)).length >= 1);
  check('the pharmacist is told too', (await noted(ids.pharmacistB)).length >= 1);
  const before = (await q(`SELECT COUNT(*)::int AS n FROM notifications WHERE type = 'pharmacist_registration_expiring' AND user_id = $1`, [ids.opsAdmin]))[0].n;
  await call('POST', '/admin/jobs/pharmacist_registration_alerts/run', { token: t.admin });
  const after = (await q(`SELECT COUNT(*)::int AS n FROM notifications WHERE type = 'pharmacist_registration_expiring' AND user_id = $1`, [ids.opsAdmin]))[0].n;
  check('… not again on the next run', after === before, { before, after });
  await verifyStaff(ids.pharmacistB, 'MSPC-S39-2');
  await putPartner(V.pharmacist, { valid_till: inDays(365), verified: true });
}
