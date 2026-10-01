// Regulator recall / NSQ alerts (C-28): list import, batch matching, recall or clear,
// receipts blocked, 4-hour watch, final records
import pg from 'pg';
import { API, call, check, q } from '../sprint5/lib.mjs';

async function waitFor(sql, params, ms = 10000) {
  const end = Date.now() + ms;
  let rows = [];
  while (Date.now() < end) { rows = await q(sql, params); if (rows.length) return rows; await new Promise((r) => setTimeout(r, 200)); }
  return rows;
}

const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

async function importList(token, csv, fields) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  form.append('file', new Blob([csv], { type: 'text/csv' }), 'nsq.csv');
  const res = await fetch(`${API}/recalls/alerts/import`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

export async function runRecallAlerts({ t, P, V, ids, order }) {
  console.log('Recall alerts');
  const received = new Date(Date.now() - 30 * 60_000).toISOString();
  const header = { source: 'cdsco_nsq', reference: 'S14 CDSCO NSQ alert September 2026', received_at: received };
  const csv = 'Drug Alert List,,,,\nS.No,Name of the Drug,Batch No.,Manufactured by,Reason for NSQ\n'
    + '1,"S14 Paracetamol Tablets IP 500 mg",S14-AB77,"S14 Pharma, Nashik",Dissolution\n'
    + '2,"S14 Unrelated Injection",S14-ZZ-99,Other Labs,Sterility\n';

  let r = await importList(t.buyer, csv, header);
  check('only admins enter recall alerts', r.status === 403, r.status);
  r = await importList(t.admin, csv, { ...header, received_at: new Date(Date.now() + 3600e3).toISOString() });
  check('an alert cannot be received in the future', r.status === 400, r.json);
  r = await importList(t.admin, 'Drug,Reason\nX,Y\n', header);
  check('a list without batch numbers is refused', r.status === 422, r.json);

  r = await importList(t.admin, csv, header);
  const alert = r.json.data;
  check('CDSCO list imported: 2 lines, the batch found on both products that carry it', r.status === 201 && alert.lines === 2 && alert.matches === 2 && /^RA-\d{5}$/.test(alert.alert_no), r.json);
  check('4-hour deadline from receipt (C-28)', alert && new Date(alert.due_at).getTime() === new Date(received).getTime() + 4 * 3600e3, alert?.due_at);
  const adminNote = await waitFor(`SELECT 1 FROM notifications WHERE user_id = $1 AND type = 'recall_alert'`, [ids.admin]);
  check('admins alerted at once', adminNote.length === 1);

  r = await call('GET', `/recalls/alerts/${alert.id}`, { token: t.admin });
  const line1 = r.json.data?.lines?.[0];
  const mPara = line1?.matches?.find((m) => m.product_id === P.para), mSyrup = line1?.matches?.find((m) => m.product_id === P.syrup);
  check('matched line first, with our product, stock held and sold', line1?.line_no === 1 && mPara?.units_held === 100 && mPara?.units_sold === 2
    && mPara?.batch_numbers?.[0] === 'S14/AB-77' && mSyrup?.units_held === 40, line1);
  check('unmatched line kept on record with no matches', r.json.data?.lines?.[1]?.matches?.length === 0 && r.json.data?.pending === 2);
  r = await call('GET', '/recalls/alerts?open=true', { token: t.admin });
  check('open alerts list it', r.json.data?.alerts?.some((a) => a.id === alert.id && a.pending === 2 && !a.overdue), r.json.data);

  r = await call('POST', `/recalls/alerts/matches/${mSyrup.id}/clear`, { token: t.admin, body: { notes: 'no' } });
  check('clearing needs a reason', r.status === 422, r.status);
  r = await call('POST', `/recalls/alerts/matches/${mSyrup.id}/clear`, { token: t.admin, body: { notes: 'Different drug and maker; batch number coincides' } });
  check('a different product with the same batch number is cleared with a note', r.status === 200 && r.json.data?.decision === 'cleared', r.json);
  r = await call('POST', `/recalls/alerts/matches/${mSyrup.id}/recall`, { token: t.admin });
  check('a decision is final', r.status === 409, r.json);

  r = await call('POST', `/recalls/alerts/matches/${mPara.id}/recall`, { token: t.admin });
  check('the listed product is recalled from the alert', r.status === 200 && r.json.data?.decision === 'recalled' && r.json.data?.recall_id, r.json);
  const rec = await q(`SELECT r.source, r.reason, b.is_recalled FROM batch_recalls r JOIN inventory_batches b ON b.product_id = r.product_id AND b.batch_number = r.batch_number WHERE r.product_id = $1`, [P.para]);
  check('…batch blocked and the recall names the alert', rec[0]?.is_recalled === true && rec[0].reason.includes(alert.alert_no) && rec[0].source.startsWith('S14 CDSCO'), rec);
  const buyerNote = await waitFor(`SELECT 1 FROM notifications WHERE user_id = $1 AND type = 'batch_recall'`, [ids.buyer]);
  check('…and the buyer is told to stop using it', buyerNote.length === 1);
  r = await call('GET', `/recalls/alerts/${alert.id}`, { token: t.admin });
  check('alert closed once every match is decided', r.json.data?.pending === 0 && r.json.data?.recalled === 1 && r.json.data?.cleared === 1, r.json.data);

  // Receipts: a batch on an alert (even one we never held) waits for an admin
  const receive = (product_id, batch, inv) => call('POST', '/purchasing/receipts', { token: t.admin, body: { vendor_id: V, supplier_invoice_no: inv,
    supplier_invoice_date: day(0), lines: [{ product_id, batch_number: batch, expiry_date: day(500), quantity: 5, unit_cost_paise: 5000, printed_mrp_paise: 10000 }] } });
  r = await receive(P.syrup, 'S14 ZZ 99', 'S14-INV-1');
  check('receiving a batch named on an alert is refused', r.status === 409 && r.json.message.includes(alert.alert_no), r.json);
  const line2 = (await call('GET', `/recalls/alerts/${alert.id}`, { token: t.admin })).json.data.lines[1];
  r = await call('POST', `/recalls/alerts/lines/${line2.id}/clear`, { token: t.admin, body: { product_id: P.syrup, notes: 'Our syrup, not the injection on the list' } });
  check('admin clears that product for the line', r.status === 201, r.json);
  r = await call('POST', `/recalls/alerts/lines/${line2.id}/clear`, { token: t.admin, body: { product_id: P.syrup, notes: 'Our syrup, not the injection on the list' } });
  check('…once', r.status === 409);
  r = await receive(P.syrup, 'S14 ZZ 99', 'S14-INV-2');
  check('…then the receipt goes through', r.status === 201, r.json);
  r = await receive(P.para, 'S14-ZZ99', 'S14-INV-3');
  check('clearing is per product: another product with that batch is still refused', r.status === 409, r.json);
  r = await receive(P.para, 'S14/AB-77', 'S14-INV-4');
  check('a recalled batch cannot be received', r.status === 409 && /recalled/.test(r.json.message), r.json);

  // Records are final (a plain session; the test session runs in maintenance mode for cleanup)
  const plain = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await plain.connect();
  const err = (sql, p) => plain.query(sql, p).then(() => null, (e) => e.message);
  check('a decided match cannot be edited', /final/.test(await err(`UPDATE recall_alert_matches SET notes = 'edited' WHERE id = $1`, [mSyrup.id])));
  check('alert lines cannot be deleted', /cannot/.test(await err(`DELETE FROM recall_alert_lines WHERE id = $1`, [line2.id])));
  check('the alert cannot be back-dated', /cannot be changed/.test(await err(`UPDATE recall_alerts SET received_at = NOW(), due_at = NOW() + INTERVAL '4 hours' WHERE id = $1`, [alert.id])));
  await plain.end();

  // The 4-hour watch
  r = await call('POST', '/recalls/alerts', { token: t.admin, body: { source: 'fda_maharashtra', reference: 'S14 FDA email 5 hours old',
    received_at: new Date(Date.now() - 5 * 3600e3).toISOString(), lines: [{ drug_name: 'S14 Cough Syrup', batch_number: 'S14-AB-77' }] } });
  check('lines typed in from an FDA email', r.status === 201 && r.json.data?.matches === 2, r.json);
  r = await call('POST', '/admin/jobs/recall_alert_watch/run', { token: t.admin });
  check('watch flags the alert past 4 hours', r.status === 200 && r.json.data?.summary?.overdue_alerts >= 1, r.json);
  const overdue = await waitFor(`SELECT 1 FROM notifications WHERE user_id = $1 AND type = 'recall_alert_overdue'`, [ids.admin]);
  check('…and tells admins', overdue.length === 1);
  r = await call('POST', '/admin/jobs/recall_alert_watch/run', { token: t.admin });
  check('…only once', r.json.data?.summary?.overdue_alerts === 0, r.json);
  r = await call('GET', '/recalls/alerts?open=true', { token: t.admin });
  check('open list shows it overdue', r.json.data?.alerts?.some((a) => a.reference === 'S14 FDA email 5 hours old' && a.overdue), r.json.data);
  void order;
}
