// Adjustments (two-person rule), destruction register, expiry watch, stock counts, sales from received stock
import { call, check, db, q } from '../sprint5/lib.mjs';
import { PIN } from './fixtures.mjs';

export async function runStock({ t, P, addr }, { batchA }) {
  const qty = async (id) => (await q(`SELECT quantity_available FROM inventory_batches WHERE id = $1`, [id]))[0].quantity_available;

  console.log('Adjustments (C-46)');
  const adjust = (body, token = t.packer) => call('POST', '/stock/adjustments', { token, body: { batch_id: batchA, notes: 'Carton crushed in rack B', ...body } });
  let r = await adjust({ quantity_delta: 5, reason: 'damaged' });
  check('damage must remove stock', r.status === 400, r.json);
  r = await adjust({ quantity_delta: -1000, reason: 'damaged' });
  check('cannot remove more than the free stock', r.status === 409, r.json);
  r = await adjust({ quantity_delta: -5, reason: 'damaged' });
  const dmg = r.json.data;
  check('storekeeper raises a damage write-off', r.status === 201 && /^ADJ-\d{4}-\d{6}$/.test(dmg?.adjustment_no || ''), r.json);
  check('stock unchanged until approved', (await qty(batchA)) === 110);
  r = await call('POST', `/stock/adjustments/${dmg.id}/decide`, { token: t.packer, body: { approve: true, notes: 'ok' } });
  check('storekeeper cannot approve', r.status === 403, r.json);
  r = await call('POST', `/stock/adjustments/${dmg.id}/decide`, { token: t.admin, body: { approve: true, notes: 'Photo seen' } });
  check('admin approves; stock reduced', r.status === 200 && (await qty(batchA)) === 105, r.json);
  r = await adjust({ quantity_delta: -1, reason: 'sample' }, t.admin);
  r = await call('POST', `/stock/adjustments/${r.json.data.id}/decide`, { token: t.admin, body: { approve: true, notes: 'self' } });
  check('nobody approves their own adjustment', r.status === 403, r.json);

  console.log('Destruction register');
  r = await call('POST', `/stock/adjustments/${dmg.id}/disposal`, { token: t.packer, body: { method: 'authorised_vendor', reference: 'BMW-2026-117', witness: 'S7 Pharmacist' } });
  check('whoever raised the write-off does not certify its destruction (C-46)', r.status === 403, r.json);
  r = await call('POST', `/stock/adjustments/${dmg.id}/disposal`, { token: t.admin2, body: { method: 'authorised_vendor', reference: 'BMW-2026-117', witness: 'S7 Pharmacist' } });
  check('destruction recorded for the damaged stock', r.status === 200, r.json);
  r = await call('POST', `/stock/adjustments/${dmg.id}/disposal`, { token: t.admin2, body: { method: 'incineration', reference: 'X-1', witness: 'Someone' } });
  check('destruction cannot be recorded twice', r.status === 409, r.json);
  r = await call('GET', '/stock/destruction-register', { token: t.packer });
  check('destruction register lists it', r.json.data?.entries?.some((e) => e.id === dmg.id && e.disposal_reference === 'BMW-2026-117'), r.json);

  console.log('Expiry watch');
  const expired = (await q(`INSERT INTO inventory_batches (product_id, batch_number, quantity_available, purchase_price_paise, expiry_date)
     VALUES ($1, 'S7-OLD', 20, 4000, CURRENT_DATE - 1) RETURNING id`, [P.b]))[0].id;
  r = await call('POST', '/admin/jobs/expiry_watch/run', { token: t.admin });
  const j1 = r.json.data?.summary;
  r = await call('POST', '/admin/jobs/expiry_watch/run', { token: t.admin });
  const j2 = r.json.data?.summary;
  const raised = await q(`SELECT id, status, requested_by, quantity_delta FROM stock_adjustments WHERE batch_id = $1`, [expired]);
  check('expired batch raised once for write-off, by the system', j1?.expired_raised >= 1 && raised.length === 1
    && raised[0].requested_by === null && raised[0].quantity_delta === -20, { j1, j2, raised });
  r = await call('POST', `/stock/adjustments/${raised[0].id}/decide`, { token: t.admin, body: { approve: true, notes: 'Expired' } });
  check('admin approves the expiry write-off', r.status === 200 && (await qty(expired)) === 0, r.json);
  r = await call('GET', '/stock/destruction-register?pending=true', { token: t.packer });
  check('expired stock waits on the destruction register', r.json.data?.entries?.some((e) => e.id === raised[0].id), r.json.data?.entries?.length);

  console.log('Stock count');
  const batchB = (await q(`SELECT id FROM inventory_batches WHERE product_id = $1 AND batch_number = 'S7-B-001'`, [P.b]))[0].id;
  r = await call('POST', '/stock/counts', { token: t.packer, body: { label: 'S7 product B', product_ids: [P.b] } });
  const cnt = r.json.data;
  check('count started with a snapshot', r.status === 201 && cnt.lines === 1, r.json);
  r = await call('POST', `/stock/counts/${cnt.id}/submit`, { token: t.packer });
  check('cannot submit before every batch is counted', r.status === 400, r.json);
  r = await call('PUT', `/stock/counts/${cnt.id}/lines`, { token: t.admin, body: { lines: [{ batch_id: batchB, counted_qty: 48 }] } });
  check('only the counter records the count', r.status === 403, r.json);
  await call('PUT', `/stock/counts/${cnt.id}/lines`, { token: t.packer, body: { lines: [{ batch_id: batchB, counted_qty: 48 }] } });
  await call('POST', `/stock/counts/${cnt.id}/submit`, { token: t.packer });
  // Stock moving during the count makes its variance untrue (security review H1)
  await q(`UPDATE inventory_batches SET quantity_available = quantity_available + 1 WHERE id = $1`, [batchB]);
  r = await call('POST', `/stock/counts/${cnt.id}/approve`, { token: t.admin2 });
  check('a count whose stock moved since it started is not approved', r.status === 409 && /moved during the count/.test(r.json.message), r.json);
  await q(`UPDATE inventory_batches SET quantity_available = quantity_available - 1 WHERE id = $1`, [batchB]);
  r = await call('POST', `/stock/counts/${cnt.id}/approve`, { token: t.admin2 });
  check('a second person approves; the shortfall becomes an approved adjustment', r.status === 200 && r.json.data.variances === 1 && (await qty(batchB)) === 48, r.json);

  console.log('Selling received stock');
  r = await call('POST', '/orders', { token: t.buyer, body: { address_id: addr, pincode: PIN, items: [{ product_id: P.a, quantity: 2 }] } });
  const line = r.json.data?.order ? (await q(`SELECT batch_id FROM order_items WHERE order_id = $1`, [r.json.data.order.id]))[0] : null;
  check('orders draw on the received batch', r.status === 201 && line?.batch_id === batchA, r.json);
  r = await call('POST', '/inventory/inventory/batch', { token: t.admin, body: { product_id: P.a, batch_number: 'X', quantity: 5, expiry_date: '2030-01-01' } });
  check('the old unchecked "add batch" route is gone', r.status === 404, r.status);

  console.log('Records and prices protected (security review)');
  const adj = (await q(`SELECT id FROM stock_adjustments WHERE batch_id = $1 AND status = 'approved' LIMIT 1`, [batchB]))[0];
  let blocked = null;
  try { await db.query('BEGIN'); await db.query("SET LOCAL dawabag.maintenance = 'off'"); await db.query(`UPDATE stock_adjustments SET quantity_delta = -1 WHERE id = $1`, [adj.id]); }
  catch (e) { blocked = e.message; } finally { await db.query('ROLLBACK'); }
  check('an approved adjustment cannot be altered', /final/.test(blocked || ''), blocked);
  blocked = null;
  try { await db.query(`UPDATE inventory_batches SET quantity_reserved = quantity_available + 1 WHERE id = $1`, [batchB]); } catch (e) { blocked = e.message; }
  check('stock can never be below what orders have reserved', /reserved_check/.test(blocked || ''), blocked);
  r = await call('PATCH', `/products/${P.b}`, { token: t.admin, body: { mrp_paise: 15000, offer_price_paise: 14000 } });
  check('no selling price above the MRP printed on stock on the shelf (C-16)', r.status === 400 && /MRP printed on stock/.test(r.json.message), r.json);
}
