// Sprint 38 — Schedule H1 register (C-09): complete entries or no dispatch; numbered
// without gaps per seller licence under concurrency; hash chain verify finds tampering;
// the partner sees its own register only. Audit log chain (C-46).
import { call, check, q } from '../sprint5/lib.mjs';
import { releaseInDb } from '../support/pharmacistCheck.mjs';
import { P, V, addr, ids, paidOrder, plainClient, t, verifiedRx } from './fixtures.mjs';

const today = () => new Date().toISOString().slice(0, 10);
export const shared = {};

async function packAndDispatch(shipmentId, awb) {
  const pack = await call('POST', `/fulfilment/shipments/${shipmentId}/pack`, { token: t.packer });
  if (pack.status !== 200) return pack;
  return call('POST', `/fulfilment/shipments/${shipmentId}/dispatch`, { token: t.packer,
    body: { courier_partner: 'Shree Courier', awb_number: awb, seal_number: `SEAL-${awb}` } });
}

export async function runH1Refusal() {
  console.log('A. Schedule H1: the prescriber address is required; a missing detail refuses dispatch');
  const a = await paidOrder([{ product_id: P.h1, quantity: 2 }]);
  const noAddress = await verifiedRx(a.order.id, P.h1, 4, { prescriber_address: undefined });
  check('verification without the prescriber address is refused, with a plain field message',
    noAddress.r.status === 422 && /prescriber's address/i.test(noAddress.r.json.message), noAddress.r.json);

  // A prescription checked before Sprint 38 (no prescriber address) — as such rows exist
  const legacy = (await q(
    `INSERT INTO prescriptions (user_id, order_id, s3_key, file_type, status, verified_by, verified_at, valid_until,
       prescriber_name, prescriber_reg_no, prescribed_on, patient_name, pharmacist_reg_no)
     VALUES ($1, $2, 'test/s38-legacy.jpg', 'jpg', 'pending', $3, NOW(), CURRENT_DATE + 60, 'Dr. S38 Old', NULL, CURRENT_DATE - 1,
       'S38 Buyer', 'MSPC-S38-1') RETURNING id`, [ids.buyer, a.order.id, ids.pharmacist]))[0].id;
  await q(`INSERT INTO prescription_items (prescription_id, product_id, prescribed_qty) VALUES ($1, $2, 4)`, [legacy, P.h1]);
  await q(`UPDATE prescriptions SET status = 'verified' WHERE id = $1`, [legacy]);
  const line = (await q(`SELECT id FROM order_items WHERE order_id = $1`, [a.order.id]))[0].id;
  await q(`INSERT INTO rx_dispense_ledger (prescription_id, product_id, kind, quantity, order_id, order_item_id) VALUES ($1, $2, 'dispense', 2, $3, $4)`,
    [legacy, P.h1, a.order.id, line]);
  await q(`UPDATE order_items SET prescription_id = $2 WHERE id = $1`, [line, legacy]);
  await q(`UPDATE orders SET status = 'rx_verified' WHERE id = $1`, [a.order.id]);
  await releaseInDb(q, a.own);
  const stockBefore = (await q(`SELECT quantity_available FROM inventory_batches WHERE product_id = $1`, [P.h1]))[0].quantity_available;
  let r = await packAndDispatch(a.own, 'S38AWB-A1');
  const s = (await q(`SELECT status FROM order_shipments WHERE id = $1`, [a.own]))[0];
  const stockAfter = (await q(`SELECT quantity_available FROM inventory_batches WHERE product_id = $1`, [P.h1]))[0].quantity_available;
  const rows = await q(`SELECT 1 FROM h1_register WHERE order_id = $1`, [a.order.id]);
  check('dispatch refused (409, H1_REGISTER_INCOMPLETE) naming the missing prescriber address and where to fill it in',
    r.status === 409 && r.json.code === 'H1_REGISTER_INCOMPLETE' && /prescriber's \(doctor's\) address is missing/.test(r.json.message)
    && /Prescriptions missing H1 details/.test(r.json.message), r.json);
  check('nothing happened: still packed, stock untouched, no register entry, no "Not recorded"', s.status === 'packed' && stockAfter === stockBefore && rows.length === 0, { s, stockBefore, stockAfter });

  r = await call('GET', '/fulfilment/prescriptions/h1-incomplete', { token: t.pharmacist });
  check('the pharmacist\'s list of prescriptions missing H1 details shows it', r.status === 200
    && r.json.data?.prescriptions?.some((x) => x.prescription_id === legacy && x.order_number === a.order.order_number), r.json.data);
  r = await call('POST', `/fulfilment/prescriptions/${legacy}/prescriber-details`, { token: t.packer, body: { prescriber_address: 'Old Clinic, Nashik' } });
  check('only a pharmacist may complete prescriber details', r.status === 403, r.json);
  r = await call('POST', `/fulfilment/prescriptions/${legacy}/prescriber-details`, { token: t.pharmacist, body: { prescriber_address: 'Old Clinic, 1 MG Road, Nashik' } });
  check('the pharmacist fills in the missing address', r.status === 200 && r.json.data?.prescriber_address === 'Old Clinic, 1 MG Road, Nashik', r.json);
  r = await call('POST', `/fulfilment/prescriptions/${legacy}/prescriber-details`, { token: t.pharmacist, body: { prescriber_address: 'Another address, Pune' } });
  check('a recorded address cannot be changed afterwards', r.status === 409, r.json);
  const audit = await q(`SELECT 1 FROM audit_logs WHERE action = 'prescription_prescriber_completed' AND new_value->>'prescription_id' = $1`, [legacy]);
  check('the completion is in the audit log', audit.length === 1);

  r = await call('POST', `/fulfilment/shipments/${a.own}/dispatch`, { token: t.packer,
    body: { courier_partner: 'Shree Courier', awb_number: 'S38AWB-A1', seal_number: 'SEAL-S38AWB-A1' } });
  const h1 = (await q(`SELECT * FROM h1_register WHERE order_id = $1`, [a.order.id]))[0];
  check('now it dispatches, with one complete entry', r.status === 200 && r.json.data?.h1_register_rows === 1, r.json);
  check('the entry carries the prescriber address, the seller licence and its register, numbered and sealed',
    h1?.prescriber_address === 'Old Clinic, 1 MG Road, Nashik' && /^dawabag:/.test(h1?.register_key) && h1?.seller_licence_no
    && Number(h1?.entry_no) >= 1 && /^[0-9a-f]{64}$/.test(h1?.row_hash) && h1?.chain_legacy === false, h1);
  shared.dawabagKey = h1?.register_key;
}

export async function runPartnerRegister() {
  console.log('B. A partner\'s register: entries 1, 2, 3 … without gaps when dispatches run at once');
  const N = 5;
  const orders = [];
  for (let i = 0; i < N + 1; i++) {
    const o = await paidOrder([{ product_id: P.h1p, quantity: 1 }]);
    const v = await verifiedRx(o.order.id, P.h1p, 1);
    if (v.r.status !== 200) throw new Error(`verify ${i}: ${JSON.stringify(v.r.json)}`);
    const rel = await call('POST', `/partner/shipments/${o.partner}/check`, { token: t.partner, body: { decision: 'release', vendor_pharmacist_id: V.pharmacist } });
    if (rel.status !== 200) throw new Error(`release ${i}: ${JSON.stringify(rel.json)}`);
    orders.push({ ...o, rx: v.rx });
  }
  shared.heldPartnerShipment = orders[N].partner;   // kept back for the emergency stop
  shared.partnerRx = orders[0].rx;
  const results = await Promise.all(orders.slice(0, N).map((o, i) => call('POST', `/partner/shipments/${o.partner}/dispatch`, { token: t.partner,
    body: { courier_partner: 'Shree Courier', awb_number: `S38PAWB${i}`, seal_number: `SEAL-S38P${i}` } })));
  check(`${N} partner dispatches at the same moment all succeed`, results.every((r) => r.status === 200), results.map((r) => [r.status, r.json.message]));
  const rows = await q(`SELECT register_key, entry_no::int AS n, prev_hash, row_hash FROM h1_register WHERE partner_id = $1 ORDER BY entry_no`, [V.a]);
  check('numbered 1…5 in the partner\'s own register, no gap, no repeat', rows.map((r) => r.n).join() === '1,2,3,4,5'
    && new Set(rows.map((r) => r.register_key)).size === 1 && rows[0].register_key.startsWith(`partner:${V.a}:`), rows);
  check('each entry links to the one before (first to the genesis hash)', rows.every((r, i) => r.prev_hash === (i ? rows[i - 1].row_hash : '0'.repeat(64))), rows);
  shared.partnerKey = rows[0]?.register_key;

  let r = await call('GET', `/partner/h1-register?from=${today()}&to=${today()}`, { token: t.partner });
  check('the partner sees its own register only', r.status === 200 && r.json.data?.entries?.length === N
    && r.json.data.entries.every((e) => e.register_key === shared.partnerKey) && r.json.data.registers?.length === 1, r.json.data?.entries?.map((e) => e.register_key));
  r = await call('GET', `/partner/h1-register?from=${today()}&to=${today()}&format=csv`, { token: t.partner, raw: true });
  check('and can download it (CSV with entry numbers)', r.status === 200 && /csv/.test(r.type) && r.buf.toString().split('\n')[0].startsWith('register_key,entry_no'), r.status);
  r = await call('GET', '/partner/h1-register/verify', { token: t.partner });
  check('the partner can check its own chain', r.status === 200 && r.json.data?.ok === true && r.json.data.registers?.length === 1, r.json.data);
  r = await call('GET', `/fulfilment/h1-register?from=${today()}&to=${today()}`, { token: t.admin });
  const keys = new Set((r.json.data?.entries ?? []).map((e) => e.register_key));
  check('Dawabag\'s admin sees every seller\'s register', r.status === 200 && keys.has(shared.partnerKey) && keys.has(shared.dawabagKey), [...keys]);
  r = await call('GET', `/fulfilment/h1-register?from=${today()}&to=${today()}&partner_id=${V.a}`, { token: t.admin });
  check('… and can filter by partner', r.json.data?.entries?.length === N, r.json.data?.entries?.length);
}

export async function runChainVerify() {
  console.log('C. The chain check recomputes every hash and reports the first broken entry');
  const key = encodeURIComponent(shared.partnerKey);
  let r = await call('GET', `/fulfilment/h1-register/verify?register_key=${key}`, { token: t.admin });
  check('the untouched register verifies', r.status === 200 && r.json.data?.ok === true && r.json.data.registers[0].checked === 5, r.json.data);
  r = await call('GET', `/fulfilment/h1-register/verify?register_key=${key}`, { token: t.partner });
  check('the staff check is for Dawabag\'s admins', r.status === 403);

  // Tampering — only possible in the test database through a superuser maintenance session
  const original = (await q(`SELECT patient_address FROM h1_register WHERE register_key = $1 AND entry_no = 3`, [shared.partnerKey]))[0].patient_address;
  await q(`UPDATE h1_register SET patient_address = 'Somewhere else' WHERE register_key = $1 AND entry_no = 3`, [shared.partnerKey]);
  r = await call('GET', `/fulfilment/h1-register/verify?register_key=${key}`, { token: t.admin });
  const b = r.json.data?.registers?.[0];
  check('a changed entry is found: the first break is entry 3, content changed', r.json.data?.ok === false && b?.first_break?.no === 3
    && /changed after it was written/.test(b.first_break.problem) && b.checked === 2, b);
  await q(`UPDATE h1_register SET patient_address = $2 WHERE register_key = $1 AND entry_no = 3`, [shared.partnerKey, original]);
  // A removed entry
  const e4 = (await q(`SELECT * FROM h1_register WHERE register_key = $1 AND entry_no = 4`, [shared.partnerKey]))[0];
  await q(`UPDATE h1_register SET entry_no = 40 WHERE id = $1`, [e4.id]);
  r = await call('GET', `/fulfilment/h1-register/verify?register_key=${key}`, { token: t.admin });
  check('a missing number is found as a gap', r.json.data?.registers?.[0]?.first_break?.no === 5 && /missing/.test(r.json.data.registers[0].first_break.problem), r.json.data?.registers?.[0]);
  await q(`UPDATE h1_register SET entry_no = 4 WHERE id = $1`, [e4.id]);
  r = await call('GET', `/fulfilment/h1-register/verify?register_key=${key}`, { token: t.admin });
  check('restored, it verifies again', r.json.data?.ok === true, r.json.data);

  console.log('   Audit log chain');
  // From just after this run's first entry (earlier suites' clean-ups removed their own rows before it)
  const first = (await q(`SELECT MIN(chain_seq)::int AS n FROM audit_logs WHERE performed_by = ANY($1) AND chain_seq IS NOT NULL`,
    [[ids.admin, ids.pharmacist, ids.packer, ids.partner]]))[0].n + 1;
  r = await call('GET', `/admin/audit-chain/verify?from=${first}`, { token: t.admin });
  check('this run\'s part of the audit chain verifies', r.status === 200 && r.json.data?.ok === true && r.json.data.checked > 5, r.json.data);
  const victim = (await q(`SELECT id, chain_seq::int AS n, notes FROM audit_logs WHERE chain_seq > $1 AND action = 'prescription_verified' ORDER BY chain_seq LIMIT 1`, [first]))[0];
  await q(`UPDATE audit_logs SET notes = 'edited' WHERE id = $1`, [victim.id]);
  r = await call('GET', `/admin/audit-chain/verify?from=${first}`, { token: t.admin });
  check('an edited audit entry is reported as the first break', r.json.data?.ok === false && r.json.data.first_break?.no === victim.n, r.json.data);
  await q(`UPDATE audit_logs SET notes = $2 WHERE id = $1`, [victim.id, victim.notes]);
  r = await call('GET', `/admin/audit-chain/verify?from=${first}`, { token: t.buyer });
  check('buyers cannot run the audit check', r.status === 403);
  const seq = await q(`SELECT chain_seq FROM audit_logs WHERE chain_seq >= $1 ORDER BY chain_seq`, [first]);
  check('audit entries are numbered without gaps', seq.length > 5 && seq.every((x, i) => Number(x.chain_seq) === first + i), seq.length);
}

export async function runAuditFailure() {
  console.log('D. An audit entry that cannot be written fails the request loudly');
  const c = await plainClient();
  try {
    // Test database only: make the audit log refuse one action
    await c.query(`CREATE OR REPLACE FUNCTION s38_fail_audit() RETURNS trigger AS $$
      BEGIN IF NEW.action = 'h1_register_exported' THEN RAISE EXCEPTION 's38 simulated audit failure'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`);
    await c.query(`CREATE TRIGGER s38_fail_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION s38_fail_audit()`);
    const r = await call('GET', `/fulfilment/h1-register?from=${today()}&to=${today()}`, { token: t.admin });
    check('the export is refused (503 AUDIT_WRITE_FAILED) and no register data leaves', r.status === 503 && r.json.code === 'AUDIT_WRITE_FAILED' && !r.json.data, r.json);
  } finally {
    await c.query(`DROP TRIGGER IF EXISTS s38_fail_audit ON audit_logs`);
    await c.query(`DROP FUNCTION IF EXISTS s38_fail_audit()`);
    await c.end();
  }
  const r = await call('GET', `/fulfilment/h1-register?from=${today()}&to=${today()}`, { token: t.admin });
  check('with the audit log back, the export works', r.status === 200, r.status);
  void addr;
}
