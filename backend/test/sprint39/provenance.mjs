// Sprint 39 — partner batch provenance (owner decision 2026-10-03; handover D18; C-02,
// C-05, C-28): supplier, supplier licence and purchase invoice per partner batch, from
// the portal stock editor, the stock file and the live feed; optional, immutable once
// recorded; a setting makes it required for Schedule H1 and cold-chain batches; shown
// to Dawabag's admin and to the partner for its own batches.
import { API, call, check, q } from '../sprint5/lib.mjs';
import { P, PP, V, inDays, plainClient, t, today } from './fixtures.mjs';

const prov = { supplier_name: 'S39 Wholesale Distributors', supplier_licence_no: 'mh-s39-whl-20b', supplier_invoice_no: 'S39/INV/1001', supplier_invoice_date: today() };
const editor = (ppId, batches) => call('PUT', `/partner/products/${ppId}/inventory`, { token: t.partner, body: { batches } });
const recorded = async (batch) => (await q(
  `SELECT pb.supplier_name, pb.supplier_licence_no, pb.supplier_invoice_no, to_char(pb.supplier_invoice_date, 'YYYY-MM-DD') AS supplier_invoice_date, pb.source
   FROM partner_batch_provenance pb JOIN partner_inventory pi ON pi.id = pb.partner_inventory_id WHERE pi.partner_id = $1 AND pi.batch_number = $2`, [V.a, batch]))[0];
const setRequired = (value) => call('PUT', '/admin/settings/partner_stock.provenance_required', { token: t.admin, body: { value } });

export async function runProvenance() {
  console.log('\nPartner batch provenance: optional, immutable once recorded (C-02, C-28)');
  const exp = inDays(400);
  let r = await editor(PP.h1p, [{ batch_number: 'S39-PB2', qty_available: 10, expiry_date: exp }]);
  check('a batch without supplier details is accepted (optional for now)', r.status === 200, r.json);
  check('… nothing recorded for it', !(await recorded('S39-PB2')));
  r = await editor(PP.h1p, [{ batch_number: 'S39-PB3', qty_available: 10, expiry_date: exp, ...prov }]);
  const got = await recorded('S39-PB3');
  check('the stock editor records supplier, licence (upper-cased), invoice number and date', r.status === 200 && got?.supplier_name === prov.supplier_name
    && got.supplier_licence_no === 'MH-S39-WHL-20B' && got.supplier_invoice_no === prov.supplier_invoice_no && got.supplier_invoice_date === today() && got.source === 'portal', got);
  r = await call('GET', `/partner/products/${PP.h1p}/inventory`, { token: t.partner });
  check('the partner sees it on the batch (read-only once recorded)', r.json.data?.batches?.find((b) => b.batch_number === 'S39-PB3')?.provenance_recorded === true, r.json.data);
  r = await editor(PP.h1p, [{ batch_number: 'S39-PB3', qty_available: 12, expiry_date: exp, ...prov }]);
  check('saving the batch again with the same details is fine (quantity changes)', r.status === 200, r.json);
  r = await editor(PP.h1p, [{ batch_number: 'S39-PB3', qty_available: 12, expiry_date: exp, ...prov, supplier_invoice_no: 'S39/INV/9999' }]);
  check('different details for a recorded batch → 409 (kept as first recorded)', r.status === 409 && r.json.code === 'PROVENANCE_FINAL', r.json);
  r = await editor(PP.h1p, [{ batch_number: 'S39-PB4', qty_available: 5, expiry_date: exp, supplier_invoice_date: '31/02/2026' }]);
  check('an unreadable invoice date is refused in plain words', (r.status === 400 || r.status === 422) && /date/.test(r.json.message), r.json);
  const c = await plainClient();
  try {
    let err = null;
    try { await c.query(`UPDATE partner_batch_provenance SET supplier_name = 'Someone else' WHERE partner_id = $1`, [V.a]); } catch (e) { err = e; }
    check('the database refuses any change to recorded provenance', /cannot be changed/.test(err?.message ?? ''), err?.message);
    err = null;
    try { await c.query(`DELETE FROM partner_batch_provenance WHERE partner_id = $1`, [V.a]); } catch (e) { err = e; }
    check('… or its deletion', /cannot be changed/.test(err?.message ?? ''), err?.message);
  } finally { await c.end(); }

  console.log('\nRequired for Schedule H1 and cold-chain batches when the setting is on');
  r = await setRequired(true);
  check('the super-admin switches "required" on', r.status === 200, r.json);
  r = await editor(PP.h1p, [{ batch_number: 'S39-PB5', qty_available: 5, expiry_date: exp }]);
  check('a new Schedule H1 batch without supplier details → 400 PROVENANCE_REQUIRED', r.status === 400 && r.json.code === 'PROVENANCE_REQUIRED', r.json);
  r = await editor(PP.h1p, [{ batch_number: 'S39-PB5', qty_available: 5, expiry_date: exp, supplier_name: 'S39 Wholesale Distributors' }]);
  check('… all four details are needed', r.status === 400 && /invoice/.test(r.json.message), r.json);
  r = await editor(PP.h1p, [{ batch_number: 'S39-PB5', qty_available: 5, expiry_date: exp, ...prov, supplier_invoice_no: 'S39/INV/1002' }]);
  check('… with them it is accepted', r.status === 200, r.json);
  r = await editor(PP.h1p, [{ batch_number: 'S39-PB3', qty_available: 15, expiry_date: exp }]);
  check('a batch recorded earlier needs nothing more', r.status === 200, r.json);
  r = await editor(PP.cold, [{ batch_number: 'S39-CB1', qty_available: 5, expiry_date: exp, cold_chain_confirmed: true }]);
  check('a cold-chain batch without details is refused too', r.status === 400 && r.json.code === 'PROVENANCE_REQUIRED', r.json);
  r = await editor(PP.feed, [{ batch_number: 'S39-FB0', qty_available: 5, expiry_date: exp }]);
  check('an ordinary OTC batch still needs none', r.status === 200, r.json);
  await setRequired(false);

  console.log('\nFrom the stock file (optional columns) and the live feed JSON');
  await q(`INSERT INTO partner_item_links (partner_id, item_key, product_id, item_label, source) VALUES ($1, 'code:S39-FEED', $2, 'S39 feed item', 'manual')`, [V.a, P.feed]);
  const csv = ['Item Code,Item Name,Batch No,Expiry,MRP,Qty,Supplier,Supplier DL No,Bill No,Bill Date',
    `S39-FEED,S39 FEED ITEM,S39-FB1,12/2027,100,20,S39 File Distributors,MH-S39-FILE-21B,S39/F/77,${today().split('-').reverse().join('/')}`].join('\n');
  const form = new FormData();
  form.append('file', new Blob([csv], { type: 'text/csv' }), 'stock.csv');
  const up = await fetch(`${API}/partner/stock-imports`, { method: 'POST', headers: { Authorization: `Bearer ${t.partner}` }, body: form });
  const imp = (await up.json()).data;
  check('the file\'s supplier columns are recognised', up.status === 201 && imp?.mapping?.supplier_name !== null && imp?.mapping?.supplier_invoice_no !== null
    && imp?.mapping?.supplier_invoice_date !== null && imp?.mapping?.supplier_licence !== null, imp?.mapping);
  r = await call('PUT', `/partner/stock-imports/${imp.id}/mapping`, { token: t.partner, body: { mapping: imp.mapping } });
  r = await call('POST', `/partner/stock-imports/${imp.id}/apply`, { token: t.partner, body: { catalogue_price_accepted: true } });
  const fromFile = await recorded('S39-FB1');
  check('applying the file records the batch\'s provenance (source file)', r.status === 200 && fromFile?.supplier_name === 'S39 File Distributors'
    && fromFile.supplier_invoice_no === 'S39/F/77' && fromFile.supplier_invoice_date === today() && fromFile.source === 'file', { r: r.json, fromFile });

  r = await call('POST', `/admin/partners/${V.a}/api-keys`, { token: t.admin, body: { label: 'S39 connector' } });
  const key = r.json.data?.secret;
  await call('PUT', `/admin/partners/${V.a}/stock-feed`, { token: t.admin, body: { mode: 'live', stale_after_minutes: 15 } });
  const item = (batch, extra = {}) => ({ item_code: 'S39-FEED', item_name: 'S39 FEED ITEM', batch, expiry: '12/2027', mrp: 100, quantity: 20, ...extra });
  const snap = async (sequence, items) => {
    const res = await fetch(`${API}/partner-feed/${V.a}/stock-snapshot`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ sequence, taken_at: new Date().toISOString(), complete: true, source: 'S39 test connector', items }) });
    return { status: res.status, json: await res.json().catch(() => ({})) };
  };
  r = await snap(1, [item('S39-FB1'), item('S39-FB2', { supplier_name: 'S39 Feed Distributors', supplier_licence: 'MH-S39-FEED-20B',
    supplier_invoice_no: 'S39/J/5', supplier_invoice_date: today() })]);
  const fromFeed = await recorded('S39-FB2');
  check('a live snapshot with supplier fields records them (source feed)', r.status === 200 && fromFeed?.supplier_name === 'S39 Feed Distributors'
    && fromFeed.source === 'feed' && r.json.data?.applied?.provenance_recorded === 1, { r: r.json.data?.applied, fromFeed });
  r = await snap(2, [item('S39-FB1', { supplier_name: 'Someone else' }), item('S39-FB2')]);
  check('a later snapshot never changes recorded provenance', (await recorded('S39-FB1')).supplier_name === 'S39 File Distributors', await recorded('S39-FB1'));
  await call('PUT', `/admin/partners/${V.a}/stock-feed`, { token: t.admin, body: { mode: 'manual' } });

  console.log('\nDisclosed to Dawabag\'s admin; each partner sees its own');
  r = await call('GET', `/partner-provenance?partner_id=${V.a}`, { token: t.opsAdmin });
  const rows = r.json.data?.batches ?? [];
  check('the admin looks up who supplied each partner batch', r.status === 200 && rows.some((b) => b.batch_number === 'S39-PB3' && b.supplier_name === prov.supplier_name)
    && rows.some((b) => b.batch_number === 'S39-PB2' && b.supplier_name === null) && r.json.data.required_for_h1_and_cold_chain === false, rows.length);
  r = await call('GET', '/partner-provenance', { token: t.partner });
  check('a partner cannot use the admin lookup', r.status === 403, r.status);
  r = await call('GET', '/partner/batch-provenance?missing=1', { token: t.partner });
  check('the partner sees its own batches still missing details', r.status === 200 && (r.json.data?.batches ?? []).every((b) => b.partner_id === V.a && b.supplier_name === null)
    && (r.json.data?.batches ?? []).some((b) => b.batch_number === 'S39-PB2'), r.json.data);
}
