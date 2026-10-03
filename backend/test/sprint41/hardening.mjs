// Sprint 41 — approved cold-chain couriers (URS-105, C-25) and the smaller review fixes:
// the JSON body limit, one chain check at a time, another partner's excursion is "not found",
// staff lists without mobile numbers, and the chain heads a backup records.
import { execFile } from 'child_process';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { API, call, check, q, redis } from '../sprint5/lib.mjs';
import { checkoutPayment } from '../fakes/razorpay.mjs';
import { P, PP, V, addr, PIN, inDays, shipmentsOf, t } from '../sprint39/fixtures.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const setCouriers = (value, token = t.admin) => call('PUT', '/admin/settings/delivery.cold_chain_couriers', { token, body: { value } });
const warnings = async () => (await call('GET', '/admin/config-warnings', { token: t.opsAdmin })).json.data?.warnings ?? [];

async function paidColdPartnerOrder() {
  const r = await call('POST', '/orders', { token: t.buyer, body: { address_id: addr.buyer, pincode: PIN, items: [{ product_id: P.cold, quantity: 1 }] } });
  const order = r.json.data?.order;
  if (!order) return { r };
  const c = await call('POST', '/payments/create-order', { token: t.buyer, body: { order_id: order.id } });
  await call('POST', '/payments/verify', { token: t.buyer, body: checkoutPayment(c.json.data.razorpay_order_id, { status: 'captured' }) });
  return { r, order, shipment: (await shipmentsOf(order.id)).partner };
}

export async function runColdChainCouriers() {
  console.log('\nD. Approved cold-chain couriers (URS-105, C-25)');
  let r = await setCouriers(null);
  check('not set: the dashboard says refrigerated parcels may go with any courier', r.status === 200
    && (await warnings()).some((w) => w.code === 'COLD_CHAIN_COURIERS_NOT_SET'));
  r = await setCouriers('Cold <b>Express</b>');
  check('the list takes plain names only (422)', r.status === 422, r.json);
  r = await setCouriers('Cold Express, Dawabag rider', t.opsAdmin);
  check('only a super-admin edits settings (403 for an admin)', r.status === 403, r.json);
  r = await setCouriers('  Cold Express ,  Dawabag rider ');
  check('a super-admin sets the approved list', r.status === 200 && !(await warnings()).some((w) => w.code === 'COLD_CHAIN_COURIERS_NOT_SET'), r.json);

  // A partner's refrigerated parcel: released by its pharmacist, then dispatched
  await call('PUT', `/pharmacist-registrations/partner/${V.pharmacist}`, { token: t.opsAdmin,
    body: { state_council: 'Maharashtra State Pharmacy Council', valid_till: inDays(300), verified: true } });
  await q(`INSERT INTO partner_inventory (partner_id, partner_product_id, batch_number, qty_available, expiry_date, cold_chain_confirmed)
           VALUES ($1, $2, 'S41-CB1', 20, CURRENT_DATE + 300, TRUE) ON CONFLICT (partner_product_id, batch_number) DO NOTHING`, [V.a, PP.cold]);
  const o = await paidColdPartnerOrder();
  check('a paid order for a refrigerated medicine goes to the partner', !!o.shipment, o.r?.json);
  if (!o.shipment) return;
  r = await call('POST', `/partner/shipments/${o.shipment}/check`, { token: t.partner, body: { decision: 'release', vendor_pharmacist_id: V.pharmacist } });
  check('… released by the partner\'s pharmacist', r.status === 200, r.json);
  const dispatch = (courier) => call('POST', `/partner/shipments/${o.shipment}/dispatch`, { token: t.partner,
    body: { courier_partner: courier, awb_number: 'S41-AWB-1', seal_number: 'S41-SEAL-1', cold_chain_temp_c: 5, cold_chain_logger_id: 'S41-LOG-1' } });
  r = await dispatch('Speedy Post');
  check('dispatch with a courier not on the list → 409 COLD_CHAIN_COURIER_NOT_APPROVED naming the approved ones', r.status === 409
    && r.json.code === 'COLD_CHAIN_COURIER_NOT_APPROVED' && /Cold Express, Dawabag rider/.test(r.json.message), r.json);
  const [s] = await q(`SELECT status FROM order_shipments WHERE id = $1`, [o.shipment]);
  check('… and the parcel did not leave', s.status !== 'dispatched', s);
  r = await dispatch('cold  express');
  check('an approved courier (any case / spacing) → dispatched', r.status === 200 && r.json.data?.status === 'dispatched', r.json);
  await setCouriers(null);
}

export async function runHardening() {
  console.log('\nE. Smaller review fixes');
  // JSON bodies: 1 MB, except a partner connector's snapshot (10 MB, after the key check)
  const big = JSON.stringify({ mobile: '9000004199', password: 'x'.repeat(1_200_000) });
  let res = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: big });
  check('a JSON body over 1 MB to an ordinary route → 413 before any work', res.status === 413, res.status);
  res = await fetch(`${API}/partner-feed/${V.a}/stock-snapshot`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sequence: 1, items: [], pad: 'x'.repeat(1_200_000) }) });
  check('… a 1.2 MB snapshot to the partner feed is read (then refused for having no key: 401)', res.status === 401, res.status);

  // One chain check at a time
  await redis.set('chain_verify:running', 'manual', 'EX', 30);
  let r = await call('POST', '/admin/chain-heads/verify', { token: t.opsAdmin });
  check('a chain check while another runs → 409 CHAIN_CHECK_RUNNING', r.status === 409 && r.json.code === 'CHAIN_CHECK_RUNNING', r.json);
  await redis.del('chain_verify:running');
  r = await call('POST', '/admin/chain-heads/verify', { token: t.opsAdmin });
  check('… and runs once the other has finished (the lock is released after a run)', r.status === 200
    && !(await redis.get('chain_verify:running')), r.json);

  // Another partner's (here: Dawabag's own) excursion is "not found" for a partner, even once decided
  const [batch] = await q(`INSERT INTO inventory_batches (product_id, batch_number, quantity_available, purchase_price_paise, expiry_date)
                           VALUES ($1, 'S41-OWN-COLD', 5, 5000, CURRENT_DATE + 300) RETURNING id`, [P.cold]);
  r = await call('POST', `/gdp/batches/own/${batch.id}/records`, { token: t.pharmacist, body: { event_kind: 'temperature_reading', temperature_c: 12 } });
  const [ex] = await q(`SELECT id FROM gdp_records WHERE batch_id = $1 AND event_kind = 'excursion'`, [batch.id]);
  check('a 12 °C reading on Dawabag\'s refrigerated batch is an excursion', r.status === 201 && !!ex, r.json);
  if (ex) {
    r = await call('POST', `/gdp/excursions/${ex.id}/disposition`, { token: t.pharmacist,
      body: { disposition: 'release', justification: 'S41: logger shows a 3-minute door opening only' } });
    const partnerTry = await call('POST', `/partner/gdp/excursions/${ex.id}/disposition`, { token: t.partner,
      body: { disposition: 'release', justification: 'S41: not this partner\'s batch at all', vendor_pharmacist_id: V.pharmacist } });
    check('a partner deciding Dawabag\'s excursion → 404 (not 409 "already decided")', r.status === 200 && partnerTry.status === 404, partnerTry.json);
  }
  await q(`UPDATE inventory_batches SET quantity_available = 0 WHERE id = $1`, [batch.id]);

  // Staff lists show names, never mobile numbers
  r = await call('GET', '/self-inspections/people', { token: t.pharmacist });
  const people = r.json.data?.people ?? r.json.data ?? [];
  check('the corrective-action owner list shows no mobile numbers', r.status === 200 && Array.isArray(people)
    && people.every((p) => !/^\d{10}$/.test(String(p.name))), r.json);

  // What a backup records: the chain heads read just before pg_dump (deploy/staging/backup/heads.sql)
  const out = await new Promise((res) => execFile('psql', [process.env.DATABASE_URL, '-X', '-qAt', '-f', `${root}/deploy/staging/backup/heads.sql`],
    (err, stdout) => res(err ? null : stdout)));
  const heads = out ? JSON.parse(out) : null;
  const [audit] = await q(`SELECT chain_seq::int AS n, row_hash FROM audit_logs WHERE chain_seq IS NOT NULL ORDER BY chain_seq DESC LIMIT 1`);
  check('the backup\'s chain-heads query names the audit head (number and hash) and every H1 register', !!heads
    && heads.audit?.last_no >= audit.n - 50 && /^[0-9a-f]{64}$/.test(heads.audit?.head_hash ?? '') && typeof heads.h1 === 'object'
    && 'recorded' in heads && 'chain_start' in heads, heads);
}
