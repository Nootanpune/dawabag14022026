// Owner decision (1 Oct 2026): partner stock makes a product sellable, but stays in
// the partner's own ledger (partner_inventory) — never copied into Dawabag's batches
import { call, check, q } from './lib.mjs';

export async function runPartnerStock({ t, P }) {
  console.log('Partner stock counts, in the partner ledger (Sprint 20)');
  const free = async () => (await q(`SELECT COALESCE(SUM(qty_available - qty_reserved), 0)::int AS n FROM partner_inventory pi
     JOIN partner_products pp ON pp.id = pi.partner_product_id WHERE pp.product_id = $1 AND NOT pi.is_recalled`, [P.part]))[0].n;
  const listed = async () => (await call('GET', '/products/search?q=S5-PART&limit=50', { token: t.buyer })).json.data?.products?.find((p) => p.id === P.part);
  let p = await listed();
  const ledger = await free();
  check('a product only a partner holds is in stock in search', p?.in_stock === true && Number(p.stock_qty) === ledger, { p, ledger });
  let r = await call('GET', `/products/${P.part}`, { token: t.buyer });
  check('…and on its product page', r.json.data?.in_stock === true, r.json.data?.stock_qty);
  await call('DELETE', '/cart', { token: t.buyer });
  await call('PUT', `/cart/items/${P.part}`, { token: t.buyer, body: { quantity: 2 } });
  r = await call('GET', '/cart', { token: t.buyer });
  const line = r.json.data?.items?.find((i) => i.product_id === P.part);
  check('…and can go in the cart without a stock warning', line && line.available !== false && !line.issue, line);
  const own = (await q(`SELECT COUNT(*)::int AS n FROM inventory_batches WHERE product_id = $1`, [P.part]))[0].n;
  check("the partner's units stay in its own ledger (no Dawabag batches)", own === 0, own);
  await q(`UPDATE partner_inventory SET is_recalled = TRUE WHERE partner_product_id IN (SELECT id FROM partner_products WHERE product_id = $1)`, [P.part]);
  p = await listed();
  check('recalled partner stock does not count', p?.in_stock === false, p);
  await q(`UPDATE partner_inventory SET is_recalled = FALSE WHERE partner_product_id IN (SELECT id FROM partner_products WHERE product_id = $1)`, [P.part]);
  await call('DELETE', '/cart', { token: t.buyer });
}
