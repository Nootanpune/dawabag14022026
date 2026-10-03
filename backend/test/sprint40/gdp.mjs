// Sprint 40 — GDP records per batch (handover D17/D19; C-25, C-28, C-34): a cold-chain
// excursion holds the batch (not sellable, not packable / dispatchable) until a pharmacist
// with a valid registration decides; records are append-only; the goods receipt writes the
// "received" record; partners record and decide on their own batches.
import { call, check, q } from '../sprint5/lib.mjs';
import { B, P, V, ids, inDays, noted, paidOrder, plainClient, t, today } from './fixtures.mjs';

const status = async (id) => (await q(`SELECT gdp_status FROM inventory_batches WHERE id = $1`, [id]))[0]?.gdp_status;
const pStatus = async (id) => (await q(`SELECT gdp_status FROM partner_inventory WHERE id = $1`, [id]))[0]?.gdp_status;
const release = (shipmentId) => call('POST', `/fulfilment/shipments/${shipmentId}/check`, { token: t.pharmacist, body: { decision: 'release' } });
const dispatch = (shipmentId, temp, n) => call('POST', `/fulfilment/shipments/${shipmentId}/dispatch`, { token: t.packer,
  body: { courier_partner: 'S40 Courier', awb_number: `S40AWB${n}${Date.now()}`, seal_number: `S40SEAL${n}`, cold_chain_temp_c: temp, cold_chain_logger_id: 'S40-LOGGER-1' } });
const JUSTIFY = 'Data logger shows 9.1 °C for 20 minutes; the maker\'s stability data allows up to 25 °C for 24 hours';

export async function runGdp() {
  console.log('\nA. GDP: a cold-chain excursion holds the batch until a pharmacist decides (C-25)');
  // An order reserved before the excursion
  const a = await paidOrder([{ product_id: P.cold, quantity: 1 }]);
  check('a cold-chain order is placed from Dawabag\'s batch', a.r.status === 201 && !!a.own, a.r.json);
  let r = await release(a.own);
  check('the pharmacist releases it for packing', r.status === 200, r.json);
  r = await call('POST', `/fulfilment/shipments/${a.own}/pack`, { token: t.packer });
  check('packed', r.status === 200, r.json);

  r = await dispatch(a.own, 12, 1);
  check('a pack read at 12 °C is still refused at dispatch (hard refusal kept)', r.status === 409 && r.json.code === 'COLD_CHAIN_EXCURSION'
    && /2–8 °C/.test(r.json.message) && /on hold/.test(r.json.message), r.json);
  const exc = await q(`SELECT id, source, event_kind, temperature_c::float AS t, shipment_id FROM gdp_records WHERE batch_id = $1 AND event_kind = 'excursion'`, [B.cold]);
  check('… and logged as an excursion on the batch (record outlives the refused dispatch)', exc.length === 1 && exc[0].source === 'dispatch'
    && exc[0].t === 12 && exc[0].shipment_id === a.own, exc);
  check('… which puts the batch ON HOLD', (await status(B.cold)) === 'on_hold');
  check('pharmacists are alerted at once', (await noted(ids.pharmacist, 'gdp_excursion')).length >= 1);

  r = await dispatch(a.own, 5, 2);
  check('held batch: not dispatchable even at 5 °C (409 GDP_HOLD)', r.status === 409 && r.json.code === 'GDP_HOLD', r.json);
  const b = await paidOrder([{ product_id: P.cold, quantity: 1 }], 'buyer2');
  check('held batch: not sellable (no stock to allocate)', b.r.status >= 400 && !b.order, b.r.json);
  r = await call('GET', `/products/${P.cold}`, { token: t.buyer2 });
  const stock = r.json.data?.stock_qty ?? r.json.data?.available_qty ?? r.json.data?.in_stock;
  check('held batch: the product page shows no stock', r.status !== 200 || stock === 0 || stock === false, r.json.data && { stock_qty: r.json.data.stock_qty, in_stock: r.json.data.in_stock });

  r = await call('GET', '/gdp/excursions/pending', { token: t.packer });
  check('the excursion is in the pending queue', r.status === 200 && r.json.data.excursions.some((e) => e.id === exc[0].id), r.json);
  r = await call('POST', `/gdp/excursions/${exc[0].id}/disposition`, { token: t.packer, body: { disposition: 'release', justification: JUSTIFY } });
  check('a packer cannot decide (pharmacist only)', r.status === 403, r.json);
  r = await call('POST', `/gdp/excursions/${exc[0].id}/disposition`, { token: t.lapsed, body: { disposition: 'release', justification: JUSTIFY } });
  check('a pharmacist whose registration lapsed cannot decide → 403 PHARMACIST_REGISTRATION_INVALID', r.status === 403
    && r.json.code === 'PHARMACIST_REGISTRATION_INVALID', r.json);
  r = await call('POST', `/gdp/excursions/${exc[0].id}/disposition`, { token: t.pharmacist, body: { disposition: 'release', justification: 'fine' } });
  check('a release needs a real justification', r.status === 400, r.json);
  r = await call('POST', `/gdp/excursions/${exc[0].id}/disposition`, { token: t.pharmacist, body: { disposition: 'release', justification: JUSTIFY } });
  check('a registered pharmacist releases it with a justification', r.status === 200 && r.json.data.batch_gdp_status === 'ok', r.json);
  const d = (await q(`SELECT pharmacist_name, pharmacist_reg_no, disposition FROM gdp_records WHERE excursion_id = $1`, [exc[0].id]))[0];
  check('… the disposition names the pharmacist and registration', d?.pharmacist_reg_no === 'MSPC-S40-1' && d.disposition === 'release', d);
  r = await call('POST', `/gdp/excursions/${exc[0].id}/disposition`, { token: t.pharmacist, body: { disposition: 'destroy', justification: JUSTIFY } });
  check('a decided excursion cannot be decided again', r.status === 409, r.json);
  r = await dispatch(a.own, 5, 3);
  check('released: the parcel leaves at 5 °C', r.status === 200, r.json);

  console.log('\nB. GDP log by hand: reading → excursion; quarantine; destroy → write-off (destruction register)');
  r = await call('POST', `/gdp/batches/own/${B.cold2}/records`, { token: t.packer, body: { event_kind: 'storage_check', notes: 'Fridge clean, logger working', storage_condition: '2–8 °C fridge' } });
  check('store staff record a storage check', r.status === 201 && r.json.data.batch_gdp_status === 'ok', r.json);
  r = await call('POST', `/gdp/batches/own/${B.cold2}/records`, { token: t.packer, body: { event_kind: 'temperature_reading', temperature_c: 11.5, notes: 'Morning reading' } });
  check('a cold-chain reading of 11.5 °C becomes an excursion and holds the batch', r.status === 201 && r.json.data.event_kind === 'excursion'
    && r.json.data.converted_to_excursion === true && r.json.data.batch_gdp_status === 'on_hold', r.json);
  const exc2 = r.json.data.id;
  r = await call('POST', `/gdp/batches/own/${B.cold2}/records`, { token: t.packer, body: { event_kind: 'excursion', notes: 'hot' } });
  check('an excursion needs a description', r.status === 400, r.json);
  r = await call('POST', `/gdp/excursions/${exc2}/disposition`, { token: t.pharmacist, body: { disposition: 'quarantine', justification: 'Waiting for the maker\'s stability data' } });
  check('quarantine keeps it held (quarantined) and still pending', r.status === 200 && (await status(B.cold2)) === 'quarantined', r.json);
  r = await call('GET', '/gdp/excursions/pending?scope=own', { token: t.pharmacist });
  check('… still in the queue as quarantined', r.json.data?.excursions?.some((e) => e.id === exc2 && e.last_disposition === 'quarantine'), r.json.data);
  r = await call('POST', `/gdp/excursions/${exc2}/disposition`, { token: t.pharmacist, body: { disposition: 'destroy', justification: 'Maker cannot support 11.5 °C for 6 hours' } });
  check('destroy: the batch is to be destroyed and a write-off raised', r.status === 200 && r.json.data.batch_gdp_status === 'destroyed'
    && /ADJ-/.test(r.json.data.stock_adjustment?.adjustment_no ?? ''), r.json);
  const adj = (await q(`SELECT reason, quantity_delta, status, requested_by FROM stock_adjustments WHERE id = $1`, [r.json.data.stock_adjustment?.id]))[0];
  check('… for all free stock, reason damaged, waiting for a second person (destruction register C-46)', adj?.reason === 'damaged'
    && adj.quantity_delta === -30 && adj.status === 'requested' && adj.requested_by === ids.pharmacist, adj);
  r = await call('GET', `/gdp/batches/own/${B.cold2}`, { token: t.opsAdmin });
  check('the batch GDP log lists every event in order', r.status === 200 && r.json.data.records.map((x) => x.event_kind).join(',')
    === 'storage_check,excursion,excursion_disposition,excursion_disposition', r.json.data?.records?.map((x) => x.event_kind));

  console.log('\nC. GDP records are final (database)');
  const plain = await plainClient();
  const err = (sql, p) => plain.query(sql, p).then(() => null, (e) => e.message);
  check('UPDATE of a GDP record refused', /append-only/.test(await err(`UPDATE gdp_records SET notes = 'x' WHERE id = $1`, [exc2]) ?? ''));
  check('DELETE of a GDP record refused', /append-only/.test(await err(`DELETE FROM gdp_records WHERE id = $1`, [exc2]) ?? ''));
  check('lifting a hold by UPDATE of the batch refused', /GDP record/.test(await err(`UPDATE inventory_batches SET gdp_status = 'ok' WHERE id = $1`, [B.cold2]) ?? ''));
  check('a disposition without a pharmacist refused', !!(await err(
    `INSERT INTO gdp_records (batch_id, product_id, batch_number, event_kind, excursion_id, disposition, justification, source)
     VALUES ($1, $2, '', 'excursion_disposition', $3, 'release', 'no pharmacist named here', 'staff')`, [B.cold2, P.cold2, exc2])));
  await plain.end();

  console.log('\nD. Goods receipt writes the "received" record with the storage condition');
  r = await call('POST', '/purchasing/receipts', { token: t.opsAdmin, body: { vendor_id: V.supplier, supplier_invoice_no: `S40-INV-${Date.now()}`,
    supplier_invoice_date: today(), lines: [{ product_id: P.grn, batch_number: 'S40-G1', expiry_date: inDays(500), quantity: 10, unit_cost_paise: 5000, printed_mrp_paise: 10000 }] } });
  check('goods received', r.status === 201, r.json);
  const rec = (await q(`SELECT g.event_kind, g.source, g.storage_condition, g.cold_chain, g.grn_line_id FROM gdp_records g
    JOIN inventory_batches b ON b.id = g.batch_id WHERE b.product_id = $1 AND b.batch_number = 'S40-G1'`, [P.grn]));
  check('… the batch has its "received" record (source grn, storage condition, cold chain)', rec.length === 1 && rec[0].event_kind === 'received'
    && rec[0].source === 'grn' && rec[0].storage_condition === 'Refrigerate 2–8 °C' && rec[0].cold_chain === true && !!rec[0].grn_line_id, rec);

  console.log('\nE. Partner portal: the partner records an excursion on its batch; its own pharmacist decides');
  r = await call('GET', '/partner/gdp/batches', { token: t.partner });
  check('the partner sees its batches', r.status === 200 && r.json.data.batches.some((x) => x.id === B.partnerCold), r.json);
  r = await call('GET', '/partner/gdp/batches', { token: t.partnerB });
  check('… another partner does not', r.status === 200 && !r.json.data.batches.some((x) => x.id === B.partnerCold));
  r = await call('POST', `/partner/gdp/batches/${B.partnerCold}/records`, { token: t.partnerB, body: { event_kind: 'storage_check', notes: 'x' } });
  check('another partner cannot record on it', r.status === 404, r.json);
  const before = await paidOrder([{ product_id: P.coldp, quantity: 1 }], 'buyer2');
  check('the partner batch sells before the excursion', before.r.status === 201 && !!before.partner, before.r.json);
  r = await call('POST', `/partner/gdp/batches/${B.partnerCold}/records`, { token: t.partner, body: { event_kind: 'excursion', temperature_c: 14,
    notes: 'Power cut 3 hours, fridge reached 14 °C' } });
  check('the partner records an excursion → its batch is on hold', r.status === 201 && (await pStatus(B.partnerCold)) === 'on_hold', r.json);
  const pexc = r.json.data.id;
  check('the partner\'s owner and Dawabag\'s admins are told', (await noted(ids.partner, 'gdp_excursion')).length >= 1
    && (await noted(ids.opsAdmin, 'gdp_excursion')).length >= 1);
  const held = await paidOrder([{ product_id: P.coldp, quantity: 1 }], 'buyer2');
  check('held partner batch: not sellable', held.r.status >= 400 && !held.order, held.r.json);
  r = await call('POST', `/gdp/excursions/${pexc}/disposition`, { token: t.pharmacist, body: { disposition: 'release', justification: JUSTIFY } });
  check('Dawabag\'s pharmacist cannot decide a partner\'s batch (the partner is the licensee)', r.status === 403, r.json);
  r = await call('POST', `/partner/gdp/excursions/${pexc}/disposition`, { token: t.partner, body: { disposition: 'release', justification: JUSTIFY, vendor_pharmacist_id: V.lapsedPharmacist } });
  check('the partner\'s lapsed pharmacist cannot decide', r.status === 403 && r.json.code === 'PHARMACIST_REGISTRATION_INVALID', r.json);
  r = await call('POST', `/partner/gdp/excursions/${pexc}/disposition`, { token: t.partner, body: { disposition: 'release', justification: JUSTIFY, vendor_pharmacist_id: V.pharmacist } });
  check('the partner\'s registered pharmacist releases it', r.status === 200 && (await pStatus(B.partnerCold)) === 'ok', r.json);
  const after = await paidOrder([{ product_id: P.coldp, quantity: 1 }], 'buyer2');
  check('… and it sells again', after.r.status === 201 && !!after.partner, after.r.json);
  for (const o of [before, after]) if (o.order) await call('POST', `/orders/${o.order.id}/cancel`, { token: t.buyer2, body: { reason: 'S40 test' } });
}
