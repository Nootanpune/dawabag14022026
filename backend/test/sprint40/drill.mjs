// Sprint 40 — mock recall drill (O15, C-28): the real trace of a batch sold through Dawabag
// AND a partner — orders, buyers, partners, stock by location — with time-to-trace; nobody
// is contacted and nothing is blocked; the report is generated on demand; the record is final.
import { call, check, q } from '../sprint5/lib.mjs';
import { B, P, V, addPartnerDrillBatch, ids, paidOrder, plainClient, t } from './fixtures.mjs';

export async function runDrill() {
  console.log('\nG. Mock recall drill (C-28)');
  const own = await paidOrder([{ product_id: P.drill, quantity: 2 }]);
  check('an order is supplied from Dawabag\'s batch S40-D1', own.r.status === 201 && !!own.own && !own.partner, own.r.json);
  // Dawabag's batch can no longer supply (short shelf life): the next order goes to the partner's S40-D1
  await q(`UPDATE inventory_batches SET expiry_date = CURRENT_DATE + 10 WHERE id = $1`, [B.drill]);
  await addPartnerDrillBatch();
  const viaPartner = await paidOrder([{ product_id: P.drill, quantity: 3 }], 'buyer2');
  check('another order is supplied from the partner\'s batch S40-D1', viaPartner.r.status === 201 && !!viaPartner.partner, viaPartner.r.json);
  await new Promise((res) => setTimeout(res, 1500));   // the order notifications land first
  const notesBefore = (await q(`SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = ANY($1)`, [[ids.buyer, ids.buyer2, ids.partner]]))[0].n;

  let r = await call('GET', '/recall-drills/batches?q=S40-DRILL', { token: t.opsAdmin });
  check('the admin finds the batch to drill (Dawabag and partner)', r.status === 200 && r.json.data.batches.some((b) => b.batch_number === 'S40-D1'
    && b.at_dawabag && b.partner_batches === 1), r.json.data);
  r = await call('POST', '/recall-drills', { token: t.pharmacist, body: { product_id: P.drill, batch_number: 'S40-D1', scenario: 'S40 drill' } });
  check('pharmacists cannot start a drill (admins)', r.status === 403);
  r = await call('POST', '/recall-drills', { token: t.opsAdmin, body: { product_id: P.drill, batch_number: 'S40-NOPE', scenario: 'S40 drill unknown batch' } });
  check('an unknown batch is refused plainly', r.status === 404, r.json);
  r = await call('POST', '/recall-drills', { token: t.opsAdmin, body: { product_id: P.drill, batch_number: 'S40-D1',
    scenario: 'S40 drill: maker reports a labelling error on batch S40-D1' } });
  const drill = r.json.data;
  check('the drill runs the trace and records time-to-trace', r.status === 201 && /^DRILL-/.test(drill?.drill_no ?? '')
    && Number.isInteger(drill.time_to_trace_ms) && drill.buyers_contacted === false, r.json);
  const s = drill?.summary ?? {};
  check('… finds both orders, both buyers, one line by Dawabag and one by the partner', s.orders === 2 && s.buyers === 2
    && s.sold_by_dawabag === 1 && s.sold_by_partners === 1 && s.partners_involved === 1, s);
  check('… and stock on hand at both locations (Dawabag 50, partner 25; reserved still on hand)', s.stock_on_hand === 75 && s.stock_locations === 2, s);
  r = await call('GET', `/recall-drills/${drill.id}`, { token: t.opsAdmin });
  const f = r.json.data?.findings;
  check('the findings name the orders, buyers and shipments', r.status === 200 && f.lines.length === 2
    && f.lines.some((l) => l.order_number === own.order.order_number && l.seller_type === 'dawabag' && l.buyer_name === 'S40 Buyer')
    && f.lines.some((l) => l.order_number === viaPartner.order.order_number && l.partner_name === 'S40 Hill Pharmacy'), f?.lines);
  check('… stock by location', f.stock.some((x) => x.holder === 'dawabag' && x.location === 'S40 Cold room 1')
    && f.stock.some((x) => x.holder === 'partner' && x.partner_id === V.a && x.location === 'Hill shelf 4'), f?.stock);

  await new Promise((res) => setTimeout(res, 1500));
  const notesAfter = (await q(`SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = ANY($1)`, [[ids.buyer, ids.buyer2, ids.partner]]))[0].n;
  check('NOBODY was contacted (no buyer or partner notification)', notesAfter === notesBefore, { notesBefore, notesAfter });
  const blocked = await q(`SELECT 1 FROM inventory_batches WHERE id = $1 AND is_recalled UNION ALL SELECT 1 FROM partner_inventory WHERE id = $2 AND is_recalled
    UNION ALL SELECT 1 FROM batch_recalls WHERE product_id = $3`, [B.drill, B.partnerDrill, P.drill]);
  check('… and nothing was recalled or blocked', blocked.length === 0, blocked);

  r = await call('GET', `/recall-drills/${drill.id}/report.pdf`, { token: t.opsAdmin, raw: true });
  check('the drill report is generated on demand as a PDF', r.status === 200 && r.type === 'application/pdf' && r.buf.subarray(0, 4).toString() === '%PDF', r.status);
  r = await call('GET', '/recall-drills', { token: t.opsAdmin });
  check('drill history lists it', r.status === 200 && r.json.data.drills.some((d) => d.id === drill.id && d.summary?.orders === 2), r.json.data?.drills?.length);
  r = await call('POST', `/recall-drills/${drill.id}/close`, { token: t.opsAdmin, body: { conclusion: 'Traced in seconds; both sellers found', actions: 'None' } });
  check('the admin closes it with a conclusion', r.status === 200, r.json);
  r = await call('POST', `/recall-drills/${drill.id}/close`, { token: t.opsAdmin, body: { conclusion: 'Traced in seconds; both sellers found' } });
  check('… once', r.status === 409, r.json);
  const plain = await plainClient();
  const err = await plain.query(`UPDATE recall_drills SET summary = '{}' WHERE id = $1`, [drill.id]).then(() => null, (e) => e.message);
  check('the traced record cannot be changed (database)', /final/.test(err ?? ''), err);
  await plain.end();
  for (const [o, who] of [[own, t.buyer], [viaPartner, t.buyer2]]) if (o.order) await call('POST', `/orders/${o.order.id}/cancel`, { token: who, body: { reason: 'S40 drill test' } });
}
