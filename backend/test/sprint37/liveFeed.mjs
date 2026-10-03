// Sprint 37 — live stock feed (owner decisions 2026-10-03): quantities of linked, listed
// products apply automatically; new products, price / MRP changes, later expiries,
// refrigerated new batches and new listings wait for a person and are flagged urgent;
// full snapshots (absent → 0), idempotent, ordered; units in Dawabag orders the partner
// has not dispatched (billed) are held back; a stale feed stops offering stock.
import { API, call, check, q, redis } from '../sprint5/lib.mjs';
import { buildMediVisionWorkbook } from '../fixtures/partnerStockFile.mjs';
import { P, VP, V, ids, paidOrder, t } from './fixtures.mjs';

let key = '';
let keyId = '';
let exp = '';                       // expiry of the hand-entered batches (YYYY-MM-DD)
const base = Date.now() - 8 * 60_000;
let tick = 0;
const nextTime = () => new Date(base + (++tick) * 2000).toISOString();

const item = (code, batch, quantity, o = {}) => ({ item_code: code, item_name: `${code} ITEM`, pack: '10 TAB', manufacturer: 'S37R',
  batch, expiry: o.expiry ?? exp, mrp: o.mrp ?? 30, rate: o.rate ?? 26, purchase_rate: 18, quantity, gst_rate: 12 });

async function snapshot(sequence, items, { takenAt = nextTime(), as = key, partner = V.A, body } = {}) {
  const res = await fetch(`${API}/partner-feed/${partner}/stock-snapshot`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(as ? { Authorization: `Bearer ${as}` } : {}) },
    body: JSON.stringify(body ?? { sequence, taken_at: takenAt, complete: true, source: 'S37 test connector', items }),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}
const batch = async (name) => (await q(
  `SELECT qty_available, qty_reserved, mrp_paise, sale_rate_paise, feed_quantity, cold_chain_confirmed, to_char(expiry_date, 'YYYY-MM-DD') AS expiry
   FROM partner_inventory WHERE partner_id = $1 AND batch_number = $2`, [V.A, name]))[0];
const stock = async (productId) => {
  const r = await call('GET', `/products/${productId}`, { token: t.buyer });
  return Number(r.json.data?.stock_qty ?? r.json.data?.product?.stock_qty ?? NaN);
};
const open = async () => q(`SELECT id, kind, item_key, batch_key, details FROM partner_feed_checks WHERE partner_id = $1 AND status = 'open' ORDER BY kind, item_key`, [V.A]);
const notes = async (type) => q(`SELECT user_id FROM notifications WHERE type = $1 AND user_id = ANY($2)`, [type, [ids.admin, ids.ownerA, ids.staffA]]);
async function waitFor(fn, ms = 6000) {
  const end = Date.now() + ms;
  for (;;) { const v = await fn(); if (v || Date.now() > end) return v; await new Promise((r) => setTimeout(r, 250)); }
}

export async function runLiveFeed() {
  [{ expiry: exp }] = await q(`SELECT to_char(expiry_date, 'YYYY-MM-DD') AS expiry FROM partner_inventory WHERE partner_id = $1 AND batch_number = 'S37A1'`, [V.A]);
  let r = await call('POST', `/admin/partners/${V.A}/api-keys`, { token: t.admin, body: { label: 'S37 MediVision connector' } });
  key = r.json.data?.secret; keyId = r.json.data?.key?.id;
  if (!key) throw new Error(`no key: ${JSON.stringify(r.json)}`);

  console.log('\nD. Live mode is opt-in per partner (admin)');
  check('a manual partner\'s hand-entered stock is offered as before', await stock(P.alpha) === 50, await stock(P.alpha));
  r = await snapshot(1, [item('S37-ALPHA', 'S37A1', 40)]);
  check('a snapshot for a partner still in manual mode → 409 in plain words', r.status === 409 && /not switched on/.test(r.json.message), r.json);
  r = await call('PUT', `/admin/partners/${V.A}/stock-feed`, { token: t.ownerA, body: { mode: 'live' } });
  check('a partner cannot switch itself to live', r.status === 403, r.status);
  r = await call('PUT', `/admin/partners/${V.A}/stock-feed`, { token: t.admin, body: { mode: 'live', stale_after_minutes: 15 } });
  check('the admin switches Partner A to live (stale after 15 min, hide when stale)', r.status === 200 && r.json.data?.mode === 'live'
    && r.json.data.stale_policy === 'hide' && r.json.data.stale === true && r.json.data.last_taken_at === null, r.json);
  const [modeAudit] = await q(`SELECT performed_by, old_value, new_value FROM audit_logs WHERE action = 'partner_stock_feed_mode_changed' AND new_value->>'vendor_id' = $1`, [V.A]);
  check('the switch is audited with who and from/to', modeAudit?.performed_by === ids.admin && modeAudit.old_value.mode === 'manual' && modeAudit.new_value.mode === 'live', modeAudit);
  check('live with no snapshot yet: the partner\'s stock is not offered', await stock(P.alpha) === 0, await stock(P.alpha));
  r = await call('PUT', `/partner/products/${(await q('SELECT id FROM partner_products WHERE partner_id = $1 AND product_id = $2', [V.A, P.alpha]))[0].id}/inventory`,
    { token: t.ownerA, body: { batches: [{ batch_number: 'S37A1', qty_available: 99, expiry_date: exp }] } });
  check('no second authority: the portal stock editor is refused while live', r.status === 409 && /billing software/.test(r.json.message), r.json);

  console.log('\nA. A full snapshot: quantities apply, the rest waits for a person');
  const first = [
    item('S37-ALPHA', 'S37A1', 40), item('S37-ALPHA', 'S37A2', 5),          // existing + new batch (valid expiry)
    item('S37-BETA', 'S37B1', 15),
    item('S37-COLD', 'S37C1', 6), item('S37-COLD', 'S37C2', 4),             // refrigerated: new batch waits (C-25)
    item('S37-GAMMA', 'S37G1', 7),                                           // linked, not listed → listing declarations
    item('S37-UNKNOWN', 'S37U1', 3),                                          // not on Dawabag → new product
    item('S37-ALPHA', 'S37AX', 9, { expiry: '2020-01' }),                    // expired: never on sale
  ];
  r = await snapshot(1, first);
  const s1 = r.json.data;
  check('accepted (200, applied) with a summary of what was applied and what waits', r.status === 200 && s1?.status === 'applied'
    && s1.applied.batches_new === 1 && s1.waiting_for_check.open === 3 && s1.waiting_for_check.new === 3, r.json);
  check('existing batches mirror the software: ALPHA A1 40, BETA B1 15, COLD C1 6', (await batch('S37A1')).qty_available === 40
    && (await batch('S37B1')).qty_available === 15 && (await batch('S37C1')).qty_available === 6, [await batch('S37A1'), await batch('S37B1')]);
  const a2 = await batch('S37A2');
  check('a new batch of a listed product with a valid expiry is added automatically (MRP recorded)', a2?.qty_available === 5 && a2.mrp_paise === 3000, a2);
  check('the expired batch is not added', !(await batch('S37AX')), await batch('S37AX'));
  check('the refrigerated new batch is NOT added until cold storage is confirmed', !(await batch('S37C2')), await batch('S37C2'));
  let checks = await open();
  check('waiting: new product, new listing, refrigerated batch (one each)', checks.map((c) => c.kind).join() === 'cold_chain_batch,new_listing,new_product', checks.map((c) => c.kind));
  check('ALPHA is offered from the snapshot (40 + 5)', await stock(P.alpha) === 45, await stock(P.alpha));
  const n1 = await waitFor(async () => { const n = await notes('stock_feed_checks'); return n.length >= 2 ? n : null; });
  check('the partner\'s owner and the admins are notified once that items wait (not the counter login)', n1?.some((n) => n.user_id === ids.admin)
    && n1.some((n) => n.user_id === ids.ownerA) && !n1.some((n) => n.user_id === ids.staffA), n1);

  console.log('\nUrgent badge counts');
  r = await call('GET', '/partner/stock-feed/alerts', { token: t.staffA });
  check('partner badge: 3 waiting, feed fresh', r.status === 200 && r.json.data.waiting_checks === 3 && r.json.data.stale === false && r.json.data.mode === 'live', r.json);
  r = await call('GET', '/admin/stock-feeds/alerts', { token: t.admin });
  const mine = r.json.data?.partners?.find((p) => p.partner_id === V.A);
  check('admin badge: counts Partner A\'s 3 waiting, not stale', r.status === 200 && r.json.data.waiting_checks >= 3 && mine?.waiting === 3 && mine.stale === false, r.json);
  r = await call('GET', '/admin/stock-feeds/alerts', { token: t.ownerA });
  check('partners cannot read the admin counts', r.status === 403, r.status);
  r = await call('GET', '/partner/stock-feed', { token: t.ownerA });
  check('"Stock last updated" time and settings are shown to the partner', r.status === 200 && !!r.json.data.last_taken_at && r.json.data.last_sequence === 1
    && r.json.data.waiting_by_kind.new_product === 1, r.json);

  console.log('\nIdempotent and ordered');
  const imports = async () => Number((await q(`SELECT COUNT(*)::int AS n FROM partner_stock_imports WHERE partner_id = $1 AND mode = 'live'`, [V.A]))[0].n);
  const before = { imports: await imports(), a1: await batch('S37A1'), notes: (await notes('stock_feed_checks')).length };
  const sameTime = s1.taken_at;
  r = await snapshot(1, first, { takenAt: sameTime });
  check('the same snapshot again (retry) → replay: same answer, nothing changes', r.status === 200 && r.json.data.status === 'replay'
    && r.json.data.import_id === s1.import_id && await imports() === before.imports, r.json.data?.status);
  r = await snapshot(2, first);
  check('the same stock with a newer sequence → unchanged: no new import, same ledger', r.status === 200 && r.json.data.status === 'unchanged'
    && await imports() === before.imports && (await batch('S37A1')).qty_available === before.a1.qty_available, r.json.data);
  check('… and no new items or notifications', (await open()).length === 3 && (await notes('stock_feed_checks')).length === before.notes, null);
  r = await snapshot(1, [item('S37-ALPHA', 'S37A1', 1)]);
  check('an older sequence → 409 out of order; the ledger keeps the newer values', r.status === 409 && /Out of order/.test(r.json.message)
    && (await batch('S37A1')).qty_available === 40, r.json);
  r = await snapshot(2, [item('S37-ALPHA', 'S37A1', 1)]);
  check('a reused sequence with different stock → 409', r.status === 409 && /already used/.test(r.json.message), r.json);
  r = await snapshot(3, [item('S37-ALPHA', 'S37A1', 1)], { takenAt: new Date(base).toISOString() });
  check('a newer sequence taken BEFORE the applied snapshot → 409 out of order', r.status === 409 && /Out of order/.test(r.json.message), r.json);
  r = await snapshot(3, [item('S37-ALPHA', 'S37A1', 1)], { takenAt: new Date(Date.now() + 3_600_000).toISOString() });
  check('a clock far in the future → 422', r.status === 422 && /clock/.test(r.json.message), r.json);
  r = await snapshot(3, null, { body: { sequence: 3, taken_at: nextTime(), complete: false, items: [item('S37-ALPHA', 'S37A1', 1)] } });
  check('a partial snapshot is refused (complete must be true)', r.status === 422 && /complete must be true/.test(r.json.message), r.json);
  r = await snapshot(3, null, { body: { sequence: 3, taken_at: nextTime(), complete: true, items: [{ ...item('S37-ALPHA', 'S37A1', 1), qty: 2 }] } });
  check('an unknown field is refused, saying where', r.status === 422 && /items\[0\]/.test(r.json.message), r.json);
  const bad = await fetch(`${API}/partner-feed/${V.A}/stock-snapshot`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: '{"sequence": 3, "items": [' });
  check('a body that is not JSON → 400 in plain words (not a server error)', bad.status === 400 && /not valid JSON/.test((await bad.json()).message), bad.status);

  console.log('\nB. Price / MRP change waits; the quantity still applies');
  const second = first.map((i) => (i.batch === 'S37A1' ? { ...i, quantity: 38, mrp: 32 } : i));
  r = await snapshot(3, second);
  let a1 = await batch('S37A1');
  checks = await open();
  check('ALPHA A1 quantity 38 applied automatically, the MRP stays ₹30 until checked', r.json.data?.status === 'applied' && a1.qty_available === 38 && a1.mrp_paise === 3000, a1);
  check('the MRP change is waiting (from ₹30 to ₹32)', checks.some((c) => c.kind === 'price_change' && c.details.mrp?.from === 3000 && c.details.mrp?.to === 3200), checks);
  check('no second notification while items already wait (de-duplicated)', (await notes('stock_feed_checks')).length === before.notes, (await notes('stock_feed_checks')).length);

  console.log('\nFull snapshot: an item missing from it goes to 0');
  const third = second.filter((i) => i.item_code !== 'S37-BETA');
  r = await snapshot(4, third);
  check('BETA absent → its batch has 0 available and BETA is not offered', r.json.data?.status === 'applied' && (await batch('S37B1')).qty_available === 0
    && await stock(P.beta) === 0, [await batch('S37B1'), await stock(P.beta)]);

  console.log('\nB. No double counting with orders the partner has not billed yet');
  const order = await paidOrder([{ product_id: P.alpha, quantity: 3 }]);
  const invRow = (await q('SELECT batch_number FROM partner_inventory WHERE id = $1', [order.inventoryId]))[0];
  check('the order is allocated to Partner A (3 packs reserved)', !!order.shipment && order.qty === 3 && !!invRow, order);
  const bn = invRow.batch_number;
  const feedQty = bn === 'S37A1' ? 38 : 5;
  const withQty = (list, qty) => list.map((i) => (i.batch === bn ? { ...i, quantity: qty } : i));
  r = await snapshot(5, withQty(third, feedQty));
  let b = await batch(bn);
  check('a snapshot taken before the partner bills it: the 3 packs are held back (sellable = snapshot − 3)', b.qty_available === feedQty && b.qty_reserved === 3
    && r.json.data.applied.held_for_orders >= 3, [b, r.json.data?.applied]);
  check('ALPHA offered = 38 + 5 − 3', await stock(P.alpha) === 40, await stock(P.alpha));
  const takenBeforeDispatch = new Date().toISOString();
  r = await call('POST', `/partner/shipments/${order.shipment}/check`, { token: t.ownerA, body: { decision: 'release', vendor_pharmacist_id: VP.A } });
  check('the partner\'s pharmacist releases the shipment', r.status === 200, r.json);
  r = await call('POST', `/partner/shipments/${order.shipment}/dispatch`, { token: t.ownerA,
    body: { courier_partner: 'S37 Courier', awb_number: 'S37AWB1', seal_number: 'SEAL-S37-1' } });
  check('the partner dispatches it (billed in its software at dispatch)', r.status === 200, r.json);
  await new Promise((res) => setTimeout(res, 1100));
  r = await snapshot(6, withQty(third, feedQty), { takenAt: takenBeforeDispatch });
  b = await batch(bn);
  check('a snapshot taken before the dispatch still counts the 3 packs: they are subtracted (no double count)', r.json.data?.status === 'unchanged'
    && b.qty_available === feedQty - 3 && b.qty_reserved === 0 && r.json.data.applied.dispatched_after_snapshot === 3, [b, r.json.data?.applied]);
  r = await snapshot(7, withQty(third, feedQty - 3), { takenAt: new Date().toISOString() });
  b = await batch(bn);
  check('the next snapshot (software billed, 3 fewer) gives the same figure — no drift', r.json.data?.status === 'applied' && b.qty_available === feedQty - 3
    && await stock(P.alpha) === 40, [b, await stock(P.alpha)]);
  let current = withQty(third, feedQty - 3);
  let seq = 7;

  console.log('\nShortfall for open orders is raised and clears by itself');
  const order2 = await paidOrder([{ product_id: P.alpha, quantity: 2 }]);
  const bn2 = (await q('SELECT batch_number FROM partner_inventory WHERE id = $1', [order2.inventoryId]))[0].batch_number;
  const short = current.map((i) => (i.batch === bn2 ? { ...i, quantity: 1 } : i));
  r = await snapshot(++seq, short, { takenAt: new Date().toISOString() });
  b = await batch(bn2);
  check('software shows 1 pack but 2 are held for an order: stays at 2 (never below orders), raised as short', b.qty_available === 2 && b.qty_reserved === 2
    && (await open()).some((c) => c.kind === 'short_for_orders' && c.batch_key === bn2), [b, (await open()).map((c) => c.kind)]);
  r = await snapshot(++seq, current, { takenAt: new Date().toISOString() });
  check('back in stock: the shortfall closes by itself', !(await open()).some((c) => c.kind === 'short_for_orders'), (await open()).map((c) => c.kind));
  await q(`UPDATE orders SET status = 'cancelled' WHERE id = $1`, [order2.order.id]);
  await q(`UPDATE partner_inventory SET qty_reserved = GREATEST(qty_reserved - 2, 0) WHERE id = $1`, [order2.inventoryId]);
  await q(`UPDATE partner_order_items SET dispatch_status = 'cancelled' WHERE order_id = $1`, [order2.order.id]);

  console.log('\nThe partner checks the waiting items');
  checks = await open();
  const byKind = (k) => checks.find((c) => c.kind === k);
  r = await call('POST', `/partner/stock-feed/checks/${byKind('price_change').id}/accept`, { token: t.staffA, body: {} });
  a1 = await batch('S37A1');
  check('accepting the MRP change records ₹32 for the batch', r.status === 200 && a1.mrp_paise === 3200, [r.json, a1]);
  r = await call('POST', `/partner/stock-feed/checks/${byKind('cold_chain_batch').id}/accept`, { token: t.staffA, body: {} });
  check('a refrigerated batch needs the 2–8 °C confirmation (C-25)', r.status === 400 && /2–8 °C/.test(r.json.message), r.json);
  r = await call('POST', `/partner/stock-feed/checks/${byKind('cold_chain_batch').id}/accept`, { token: t.staffA, body: { cold_chain_confirmed: true } });
  const c2 = await batch('S37C2');
  check('confirmed: the batch is added with the snapshot quantity and cold storage recorded', r.status === 200 && c2?.qty_available === 4 && c2.cold_chain_confirmed === true, [r.json, c2]);
  r = await call('POST', `/partner/stock-feed/checks/${byKind('new_listing').id}/accept`, { token: t.staffA, body: {} });
  check('a new listing needs the catalogue price accepted (C-16)', r.status === 400 && /catalogue price/.test(r.json.message), r.json);
  r = await call('POST', `/partner/stock-feed/checks/${byKind('new_listing').id}/accept`, { token: t.staffA, body: { catalogue_price_accepted: true } });
  const gl = (await q(`SELECT pp.approval_status, (SELECT SUM(qty_available) FROM partner_inventory WHERE partner_product_id = pp.id)::int AS qty
                       FROM partner_products pp WHERE pp.partner_id = $1 AND pp.product_id = $2`, [V.A, P.gamma]))[0];
  check('accepted: GAMMA listed with its batch (Dawabag reviews the listing before it sells)', r.status === 200 && gl?.approval_status === 'pending' && gl.qty === 7, [r.json, gl]);
  r = await call('POST', `/partner/stock-feed/checks/${byKind('new_product').id}/dismiss`, { token: t.staffA, body: { reason: 'Cosmetic, not sold online' } });
  check('the unknown item is set aside ("not sold on Dawabag")', r.status === 200 && r.json.data.status === 'dismissed', r.json);
  r = await call('POST', `/partner/stock-feed/checks/${byKind('new_product').id}/dismiss`, { token: t.ownerB, body: { reason: 'xxxx' } });
  check('another partner cannot touch Partner A\'s items', r.status === 404, r.status);
  const decided = await q(`SELECT action, performed_by FROM audit_logs WHERE action IN ('partner_feed_check_accepted', 'partner_feed_check_dismissed') AND new_value->>'vendor_id' = $1`, [V.A]);
  check('each decision is audited with the person', decided.length === 4 && decided.every((d) => d.performed_by === ids.staffA), decided);
  r = await snapshot(++seq, current.map((i) => (i.batch === 'S37A1' ? { ...i, mrp: 32 } : i)), { takenAt: new Date().toISOString() });
  checks = await open();
  check('next snapshot: nothing re-raised (MRP accepted, item set aside, batch and listing added)', checks.length === 0 && r.json.data.waiting_for_check.open === 0, checks);
  r = await call('GET', '/partner/stock-feed/alerts', { token: t.ownerA });
  check('the badge clears (0 waiting)', r.json.data?.waiting_checks === 0, r.json);
  current = current.map((i) => (i.batch === 'S37A1' ? { ...i, mrp: 32 } : i));

  console.log('\nC. Staleness');
  const offered = await stock(P.alpha);
  await q(`UPDATE partner_stock_feeds SET last_taken_at = NOW() - INTERVAL '20 minutes', stale_alerted_at = NULL WHERE partner_id = $1`, [V.A]);
  check('no snapshot for 20 min (window 15): the partner\'s stock is not offered (default "hide")', await stock(P.alpha) === 0, await stock(P.alpha));
  r = await call('GET', '/partner/stock-feed', { token: t.ownerA });
  check('the partner sees it is stale, with the last update time', r.json.data?.stale === true && !!r.json.data.stale_since && !!r.json.data.last_taken_at, r.json.data);
  r = await call('POST', '/admin/jobs/live_stock_feed_watch/run', { token: t.admin });
  check('the watch job alerts once', r.status === 200 && r.json.data?.summary?.stale_feeds_alerted >= 1, r.json);
  const staleNotes = await waitFor(async () => { const n = await notes('stock_feed_stale'); return n.length >= 2 ? n : null; });
  check('admins (and the partner\'s owner) get a "stock feed stale" notification', staleNotes?.some((n) => n.user_id === ids.admin)
    && staleNotes.some((n) => n.user_id === ids.ownerA), staleNotes);
  const staleCount = (await notes('stock_feed_stale')).length;
  r = await call('POST', '/admin/jobs/live_stock_feed_watch/run', { token: t.admin });
  await new Promise((res) => setTimeout(res, 800));
  check('… and not again while it stays stale', (await notes('stock_feed_stale')).length === staleCount, (await notes('stock_feed_stale')).length);
  r = await call('PUT', `/admin/partners/${V.A}/stock-feed`, { token: t.admin, body: { stale_policy: 'margin', stale_margin_pct: 50 } });
  const margin = await stock(P.alpha);
  check('policy "margin" (50 %): only the stock above the margin is offered', r.status === 200 && margin > 0 && margin <= Math.ceil(offered / 2), [margin, offered]);
  await call('PUT', `/admin/partners/${V.A}/stock-feed`, { token: t.admin, body: { stale_policy: 'hide' } });
  r = await snapshot(++seq, current, { takenAt: new Date().toISOString() });
  const [fresh] = await q('SELECT stale_alerted_at FROM partner_stock_feeds WHERE partner_id = $1', [V.A]);
  check('a fresh snapshot: offered again and the stale alert is re-armed', r.status === 200 && await stock(P.alpha) === offered && fresh.stale_alerted_at === null,
    [await stock(P.alpha), offered, fresh]);
  r = await call('GET', `/admin/partners/${V.A}/stock-feed`, { token: t.admin });
  check('the admin sees "Stock last updated" for the partner', r.status === 200 && !!r.json.data.last_taken_at && r.json.data.stale === false, r.json);

  console.log('\nKeys: wrong, missing, revoked, rate-limited');
  r = await snapshot(++seq, current, { partner: V.B });
  check('Partner A\'s key on Partner B → 403', r.status === 403 && /another partner/.test(r.json.message), r.json);
  r = await snapshot(seq, current, { as: null });
  check('no key → 401', r.status === 401, r.json);
  r = await snapshot(seq, current, { as: `${key.slice(0, -2)}${key.endsWith('AA') ? 'BB' : 'AA'}` });
  check('a wrong key → 401', r.status === 401, r.json);
  const windowKey = `stockfeed:live:${keyId}:${new Date().toISOString().slice(0, 13)}`;
  await redis.set(windowKey, '120', 'EX', 3600);
  r = await snapshot(seq, current);
  check('over the hourly snapshot allowance (120) → 429', r.status === 429 && /snapshots/.test(r.json.message), r.json);
  await redis.del(windowKey);

  console.log('\nThe primary path: MediVision\'s scheduled stock export uploaded as a live snapshot');
  const workbook = (qty) => buildMediVisionWorkbook([{ name: 'S37 FILE ALPHA 500MG TAB', unit: '10 TAB', com: 'S37R', tax: 12,
    batches: [{ batch: 'S37A1', exp, purc: 18, ptr: 21, mrp: 32, sale: 26, qty }] }], { company: 'S37 PARTNER A (TEST)' });
  const upload = async (xlsx, { path = 'stock-snapshot', takenAt } = {}) => {
    const f = new FormData(); f.append('file', new Blob([xlsx]), 'STOCK.XLSX');
    const res = await fetch(`${API}/partner-feed/${V.A}/${path}`, { method: 'POST',
      headers: { Authorization: `Bearer ${key}`, ...(takenAt ? { 'X-Snapshot-Taken-At': takenAt } : {}) }, body: f });
    return { status: res.status, json: await res.json().catch(() => ({})) };
  };
  const x21 = await workbook(21);
  const exportTime = new Date().toISOString();
  r = await upload(x21, { takenAt: exportTime });
  check('an export file with only the export time (header) is applied as a full snapshot: items not in it go to 0', r.status === 200
    && r.json.data?.status === 'applied' && (await batch('S37A1')).qty_available === 0 && (await batch('S37A2')).qty_available === 0, r.json);
  const fileItem = (await open()).find((c) => c.kind === 'new_product' && /file alpha/i.test(c.item_key));
  check('its unknown item (named, no item code) waits as a new product', !!fileItem, (await open()).map((c) => c.item_key));
  r = await upload(x21, { takenAt: exportTime });
  check('the same file with the same export time again → replay (file hash), nothing changes', r.status === 200 && r.json.data?.status === 'replay', r.json);
  r = await upload(await workbook(5), { takenAt: new Date(Date.parse(exportTime) - 60_000).toISOString() });
  check('a file exported before the one applied → 409 out of order', r.status === 409 && /Out of order/.test(r.json.message), r.json);
  r = await call('POST', `/partner/stock-feed/checks/${fileItem.id}/link`, { token: t.ownerA, body: { product_id: P.alpha } });
  check('the partner links the file\'s item to ALPHA once', r.status === 200, r.json);
  await new Promise((res) => setTimeout(res, 20));
  r = await upload(x21, { path: 'stock-files' });
  check('the same export sent to the Sprint 36 address with no time (upload time) → "unchanged", now matched: ALPHA A1 = 21 automatically',
    r.status === 200 && r.json.data?.status === 'unchanged' && (await batch('S37A1')).qty_available === 21, [r.json.data?.status, await batch('S37A1')]);
  r = await upload(await workbook(19));
  check('the next export (19 packs) applies by itself', r.status === 200 && r.json.data?.status === 'applied' && (await batch('S37A1')).qty_available === 19, r.json.data);
  r = await upload(x21, { takenAt: 'yesterday' });
  check('an unreadable export time → 422', r.status === 422, r.json);

  console.log('\nD. Back to manual');
  r = await call('PUT', `/admin/partners/${V.A}/stock-feed`, { token: t.admin, body: { mode: 'manual' } });
  check('switched back to manual: nothing waits on the feed any more', r.status === 200 && r.json.data.mode === 'manual' && r.json.data.waiting_checks === 0, r.json);
  r = await snapshot(++seq, current, { takenAt: new Date().toISOString() });
  check('snapshots are refused again (409)', r.status === 409, r.json);
  r = await call('PUT', `/partner/products/${(await q('SELECT id FROM partner_products WHERE partner_id = $1 AND product_id = $2', [V.A, P.alpha]))[0].id}/inventory`,
    { token: t.ownerA, body: { batches: [{ batch_number: 'S37A1', qty_available: 12, expiry_date: exp }] } });
  check('the portal stock editor works again in manual mode', r.status === 200, r.json);

  console.log('\nAudit (C-46)');
  const applied = await q(`SELECT new_value, performed_by FROM audit_logs WHERE action = 'partner_stock_feed_applied' AND new_value->>'vendor_id' = $1`, [V.A]);
  check('every applied snapshot is audited by the key\'s prefix, sequence and fingerprint — never the key', applied.length >= 8
    && applied.every((a) => a.performed_by === null && a.new_value.api_key_prefix && a.new_value.sha256 && a.new_value.sequence)
    && !JSON.stringify(applied).includes(key), applied.length);
  r = await call('POST', `/admin/partners/${V.A}/api-keys/${keyId}/revoke`, { token: t.admin, body: { reason: 'S37 test over' } });
  await call('PUT', `/admin/partners/${V.A}/stock-feed`, { token: t.admin, body: { mode: 'live' } });
  r = await snapshot(++seq, current, { takenAt: new Date().toISOString() });
  check('a revoked key is refused (401)', r.status === 401 && /revoked/.test(r.json.message), r.json);
}
