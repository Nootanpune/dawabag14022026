// Sprint 22 load test finding: simultaneous checkouts of one medicine skipped its
// locked batch and failed with "Insufficient stock" while stock was plenty. They
// now wait their turn; every order reserves exactly its own quantity.
import { call, check, q } from './lib.mjs';
import { PIN } from './fixtures.mjs';

export async function runConcurrentCheckout({ t, P, addr }) {
  console.log('Simultaneous checkouts of one medicine (Sprint 22)');
  const body = { address_id: addr.buyer, pincode: PIN, items: [{ product_id: P.own, quantity: 1 }] };
  const previews = await Promise.all(Array.from({ length: 8 }, () => call('POST', '/orders/preview', { token: t.buyer, body })));
  check('8 simultaneous checkout previews all succeed', previews.every((r) => r.status === 200), previews.map((r) => r.status));
  const before = (await q(`SELECT SUM(quantity_reserved)::int AS n FROM inventory_batches WHERE product_id = $1`, [P.own]))[0].n;
  const orders = await Promise.all(Array.from({ length: 5 }, () => call('POST', '/orders', { token: t.buyer, body })));
  const after = (await q(`SELECT SUM(quantity_reserved)::int AS n FROM inventory_batches WHERE product_id = $1`, [P.own]))[0].n;
  check('5 simultaneous orders are all placed', orders.every((r) => r.status === 201), orders.map((r) => [r.status, r.json?.message]));
  check('…and each reserves exactly its own unit', after - before === 5, { before, after });
  // Leave nothing reserved for the rest of the suite
  for (const r of orders) if (r.json.data?.order?.id) await call('POST', `/orders/${r.json.data.order.id}/cancel`, { token: t.buyer, body: { reason: 'Concurrency test' } });
}
