// Sprint 38 — the maintenance bypass is closed to the API's database role (C-34, C-46);
// verified prescriptions are frozen (C-08); the dispense ledger is append-only and keeps
// the balance; two prescription clocks (C-34); no referral codes for doctors (C-20).
import crypto from 'crypto';
import { createRequire } from 'module';
import { call, check, q } from '../sprint5/lib.mjs';
import { P, PROBE_ROLE, ids, paidOrder, people, plainClient, t, verifiedRx } from './fixtures.mjs';
import { shared } from './registers.mjs';

const require = createRequire(import.meta.url);
const { Client } = require('pg');

/** Runs sql in its own transaction; returns the error message, or null if it went through (then rolled back). */
async function attempt(c, sqls) {
  try {
    await c.query('BEGIN');
    for (const s of sqls) await c.query(s);
    await c.query('ROLLBACK');
    return null;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    return e.message;
  }
}

export async function runMaintenanceLockdown() {
  console.log('E. The maintenance bypass needs the dawabag_maintenance role; the API\'s role cannot use it');
  const admin = await plainClient();
  const password = crypto.randomBytes(12).toString('hex');
  let probe;
  try {
    const su = (await admin.query(`SELECT rolsuper FROM pg_roles WHERE rolname = current_user`)).rows[0]?.rolsuper;
    if (!su) { check('test database login is a superuser (needed to create the probe role) — skipped', true); return; }
    await admin.query(`CREATE ROLE ${PROBE_ROLE} LOGIN PASSWORD '${password}' IN ROLE dawabag_app`);
    const url = new URL(process.env.DATABASE_URL);
    url.username = PROBE_ROLE; url.password = password;
    probe = new Client({ connectionString: url.toString() });
    await probe.connect();
    const audit = (await q(`SELECT id FROM audit_logs WHERE chain_seq IS NOT NULL ORDER BY chain_seq DESC LIMIT 1`))[0].id;
    const h1 = (await q(`SELECT id FROM h1_register WHERE register_key = $1 LIMIT 1`, [shared.partnerKey]))[0].id;

    let m = await attempt(probe, [`SET LOCAL dawabag.maintenance = 'on'`, `DELETE FROM audit_logs WHERE id = '${audit}'`]);
    check('API role + maintenance setting: deleting an audit entry is refused', /statutory records are final/.test(m ?? ''), m);
    m = await attempt(probe, [`SET LOCAL dawabag.maintenance = 'on'`, `UPDATE h1_register SET patient_name = 'X' WHERE id = '${h1}'`]);
    check('API role + maintenance setting: changing an H1 entry is refused', /statutory records are final/.test(m ?? ''), m);
    m = await attempt(probe, [`SET LOCAL ROLE dawabag_maintenance`]);
    check('the API role cannot become dawabag_maintenance', /permission denied/.test(m ?? ''), m);
    m = await attempt(probe, [`SELECT set_config('role', 'dawabag_maintenance', true)`]);
    check('… not through set_config either', /permission denied/.test(m ?? ''), m);
    m = await attempt(probe, [`ALTER TABLE audit_logs DISABLE TRIGGER audit_logs_final`]);
    check('… and cannot switch the trigger off', /must be owner/.test(m ?? ''), m);
    m = await attempt(probe, [`CREATE OR REPLACE FUNCTION dawabag_maintenance_active() RETURNS boolean LANGUAGE sql AS 'SELECT true'`]);
    check('… or replace the check', /must be owner|permission denied/.test(m ?? ''), m);
    m = await attempt(probe, [`SELECT * FROM dawabag_purge_prescriptions(0)`]);
    check('the controlled maintenance route (retention purge) is open to the API role', m === null, m);
    m = await attempt(probe, [`SELECT count(*) FROM orders`, `INSERT INTO audit_logs (action) VALUES ('s38_probe_write')`]);
    check('… and ordinary work still is (read, write an audit entry)', m === null, m);

    m = await attempt(admin, [`SET LOCAL dawabag.maintenance = 'on'`, `DELETE FROM audit_logs WHERE id = '${audit}'`]);
    check('even a superuser session needs the role, not just the setting', /statutory records are final/.test(m ?? ''), m);
    m = await attempt(admin, [`SET LOCAL ROLE dawabag_maintenance`, `SET LOCAL dawabag.maintenance = 'on'`, `UPDATE audit_logs SET notes = notes WHERE id = '${audit}'`]);
    check('an operator session as dawabag_maintenance may still repair (test clean-up path)', m === null, m);
    shared.probe = probe;
  } catch (e) {
    check('maintenance lockdown checks ran', false, e.message);
  } finally {
    await admin.end();
  }
}

export async function runFrozenPrescription() {
  console.log('F. A verified prescription cannot be changed; the dispense ledger only grows');
  const o = await paidOrder([{ product_id: P.rx, quantity: 2 }]);
  const v = await verifiedRx(o.order.id, P.rx, 3);
  check('prescription verified (with the prescriber address)', v.r.status === 200, v.r.json);
  const rx = (await q(`SELECT status, prescriber_address, valid_until, retain_until, to_char(retain_until, 'YYYY-MM-DD') AS keep FROM prescriptions WHERE id = $1`, [v.rx]))[0];
  const in3y = new Date(); in3y.setFullYear(in3y.getFullYear() + 3);
  check('two clocks: valid_until for dispensing, retain_until 3 years after the dispense', rx.prescriber_address?.startsWith('Rao Clinic')
    && rx.valid_until && rx.keep === in3y.toISOString().slice(0, 10), rx);
  const ledger = await q(`SELECT kind, quantity FROM rx_dispense_ledger WHERE prescription_id = $1`, [v.rx]);
  const bal = (await q(`SELECT dispensed_qty, remaining_qty FROM prescription_item_balances WHERE prescription_id = $1`, [v.rx]))[0];
  check('the dispense is a ledger row; the balance view shows 2 dispensed, 1 left', ledger.length === 1 && ledger[0].kind === 'dispense'
    && ledger[0].quantity === 2 && bal.dispensed_qty === 2 && bal.remaining_qty === 1, { ledger, bal });

  const probe = shared.probe;
  if (!probe) { check('probe session available', false); return; }
  const tries = [
    ['changing the patient name', `UPDATE prescriptions SET patient_name = 'Someone' WHERE id = '${v.rx}'`],
    ['moving it to another order', `UPDATE prescriptions SET order_id = NULL WHERE id = '${v.rx}'`],
    ['shortening its validity', `UPDATE prescriptions SET valid_until = CURRENT_DATE WHERE id = '${v.rx}'`],
    ['changing the recorded prescriber address', `UPDATE prescriptions SET prescriber_address = 'Elsewhere' WHERE id = '${v.rx}'`],
    ['moving retain_until earlier', `UPDATE prescriptions SET retain_until = CURRENT_DATE WHERE id = '${v.rx}'`],
    ['putting it back to pending', `UPDATE prescriptions SET status = 'pending' WHERE id = '${v.rx}'`],
    ['deleting it', `DELETE FROM prescriptions WHERE id = '${v.rx}'`],
    ['changing what it allows', `UPDATE prescription_items SET prescribed_qty = 30 WHERE prescription_id = '${v.rx}'`],
    ['adding a medicine to it', `INSERT INTO prescription_items (prescription_id, product_id, prescribed_qty) VALUES ('${v.rx}', '${P.otc}', 1)`],
    ['editing a ledger row', `UPDATE rx_dispense_ledger SET quantity = 1 WHERE prescription_id = '${v.rx}'`],
    ['deleting a ledger row', `DELETE FROM rx_dispense_ledger WHERE prescription_id = '${v.rx}'`],
  ];
  for (const [what, sql] of tries) {
    const m = await attempt(probe, [sql]);
    check(`refused: ${what}`, !!m && /cannot be changed|cannot be deleted|statutory records are final/.test(m), m);
  }
  const line = (await q(`SELECT id FROM order_items WHERE order_id = $1`, [o.order.id]))[0].id;
  let m = await attempt(probe, [`INSERT INTO rx_dispense_ledger (prescription_id, product_id, kind, quantity, order_id, order_item_id)
    VALUES ('${v.rx}', '${P.rx}', 'dispense', 2, '${o.order.id}', '${line}')`]);
  check('the ledger refuses more than is left on the prescription', /Only 1 unit\(s\) left/.test(m ?? ''), m);
  m = await attempt(probe, [`UPDATE prescriptions SET status = 'expired' WHERE id = '${v.rx}'`]);
  check('allowed: verified → expired', m === null, m);
  m = await attempt(probe, [`UPDATE prescriptions SET retain_until = retain_until + 30 WHERE id = '${v.rx}'`]);
  check('allowed: keeping it longer', m === null, m);

  // Cancelling gives the quantity back as a reversal row, never by editing
  const r = await call('POST', `/orders/${o.order.id}/cancel`, { token: t.buyer, body: { reason: 'S38 changed my mind about this order' } });
  const after = await q(`SELECT kind, quantity FROM rx_dispense_ledger WHERE prescription_id = $1 ORDER BY id`, [v.rx]);
  const bal2 = (await q(`SELECT dispensed_qty, remaining_qty FROM prescription_item_balances WHERE prescription_id = $1`, [v.rx]))[0];
  check('cancelling adds a reversal row and the balance is back to 3 left', (r.status === 200 || r.status === 201)
    && after.map((x) => x.kind).join() === 'dispense,reversal' && bal2.remaining_qty === 3, { status: r.status, msg: r.json.message, after, bal2 });
}

export async function runReferral() {
  console.log('G. Doctors get no referral code (handover D22, C-20); consumers keep theirs');
  const rows = await q(`SELECT u.customer_type, up.referral_code FROM users u JOIN user_profiles up ON up.user_id = u.id WHERE u.id = ANY($1)`, [[ids.doctor, ids.buyer]]);
  const doc = rows.find((r) => r.customer_type === 'doc_hospital');
  const buyer = rows.find((r) => r.customer_type === 'customer');
  check('the doctor / hospital account has no referral code', doc && doc.referral_code === null, rows);
  check('the consumer account still has one', !!buyer?.referral_code, rows);
  void people;
}

export async function closeProbe() {
  await shared.probe?.end().catch(() => {});
}
