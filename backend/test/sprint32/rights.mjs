// Sprint 32 A + B — selling rights by licence and buyer type, and trade prices that
// follow the buyer's licence live.
import { call, check, q } from '../sprint5/lib.mjs';
import { PIN } from './fixtures.mjs';

const search = async (token) => {
  const r = await call('GET', '/products/search?q=S32&limit=50', { token });
  return new Map((r.json.data?.products ?? []).map((p) => [p.sku, p]));
};
const stockIn = (m, sku) => Number(m.get(sku)?.stock_qty ?? -1);
const order = (token, address, productId, quantity = 1) =>
  call('POST', '/orders', { token, body: { address_id: address, pincode: PIN, items: [{ product_id: productId, quantity }] } });
const sellersOf = async (orderId) => q(`SELECT seller_type, partner_id FROM order_shipments WHERE order_id = $1`, [orderId]);
const sentTo = async (r, partnerId) => {
  const id = r.json.data?.order?.id;
  if (!id) return false;
  const s = await sellersOf(id);
  return s.length === 1 && (partnerId ? s[0].partner_id === partnerId : s[0].seller_type === 'dawabag');
};

export async function rights({ t, P, V, addr }) {
  console.log('\nA. Stock shown to each buyer type = what its licensed sellers hold');
  let anon = await search(undefined);
  let buyer = await search(t.buyer);
  let trade = await search(t.retailer);
  check('retail buyer: Form 20/21 partner counted (30)', stockIn(buyer, 'S32-RET') === 30, [...buyer.values()].map((p) => [p.sku, p.stock_qty]));
  check('retail buyer: 20B/21B-only partner NOT counted (0)', stockIn(buyer, 'S32-TRD') === 0);
  check('retail buyer: four-licence partner counted (50)', stockIn(buyer, 'S32-ALL') === 50);
  check('retail buyer: mixed product = the retail partner\'s 10 (wholesaler and unlicensed partner not counted)', stockIn(buyer, 'S32-MIX') === 10);
  check('signed-out shopper sees the retail view', stockIn(anon, 'S32-RET') === 30 && stockIn(anon, 'S32-TRD') === 0 && stockIn(anon, 'S32-MIX') === 10);
  check('b2b retailer: 20/21-only partner NOT counted (0)', stockIn(trade, 'S32-RET') === 0, [...trade.values()].map((p) => [p.sku, p.stock_qty]));
  check('b2b retailer: 20B/21B partner counted (40)', stockIn(trade, 'S32-TRD') === 40);
  check('b2b retailer: four-licence partner counted (50)', stockIn(trade, 'S32-ALL') === 50);
  check('b2b retailer: mixed product = the wholesaler\'s 20', stockIn(trade, 'S32-MIX') === 20);
  check('Dawabag own stock offered to both (register holds 20/21 and 20B/21B)', stockIn(buyer, 'S32-OWN') === 200 && stockIn(trade, 'S32-OWN') === 200);
  check('prices unaffected: retail offer price vs PTR', buyer.get('S32-TRD')?.display_price_paise === 9000 && trade.get('S32-RET')?.display_price_paise === 7500,
    [buyer.get('S32-TRD')?.display_price_paise, trade.get('S32-RET')?.display_price_paise]);

  let r = await call('GET', `/products/${P.trd}`, { token: t.buyer });
  check('product page, retail buyer: wholesale-only stock not available', r.json.data?.stock_qty === 0 && r.json.data?.in_stock === false, r.json.data);
  r = await call('GET', `/products/${P.trd}`, { token: t.retailer });
  check('product page, b2b retailer: 40 in stock with a supplied batch expiry', r.json.data?.stock_qty === 40 && !!r.json.data?.supplied_batch_expiry, r.json.data);
  r = await call('GET', `/products/${P.ret}`);
  check('product page, signed out: retail partner\'s 30', r.json.data?.stock_qty === 30, r.json.data);

  await call('PUT', `/cart/items/${P.trd}`, { token: t.buyer, body: { quantity: 1 } });
  await call('PUT', `/cart/items/${P.trd}`, { token: t.retailer, body: { quantity: 1 } });
  r = await call('GET', '/cart', { token: t.buyer });
  let line = r.json.data?.items?.find((i) => i.product_id === P.trd);
  check('cart, retail buyer: wholesale-only line out of stock', line?.available === false && line?.issue === 'Out of stock', line);
  r = await call('GET', '/cart', { token: t.retailer });
  line = r.json.data?.items?.find((i) => i.product_id === P.trd);
  check('cart, b2b retailer: same line available', line?.available === true && line?.stock_qty === 40, line);
  await call('DELETE', '/cart', { token: t.buyer });
  await call('DELETE', '/cart', { token: t.retailer });

  console.log('\nA. Allocation supplies only from licensed sellers');
  r = await order(t.buyer, addr.buyer, P.trd);
  check('retail order of a 20B/21B-only product refused (nothing to allocate)', r.status === 400 && /Insufficient stock/.test(r.json.message), r.json);
  r = await order(t.buyer, addr.buyer, P.ret);
  check('retail order → the Form 20/21 partner', r.status === 201 && await sentTo(r, V.retail), r.json);
  r = await order(t.retailer, addr.retailer, P.ret);
  check('trade order of a 20/21-only product refused', r.status === 400 && /Insufficient stock/.test(r.json.message), r.json);
  r = await order(t.retailer, addr.retailer, P.trd);
  check('trade order → the Form 20B/21B partner', r.status === 201 && await sentTo(r, V.trade), r.json);
  r = await order(t.buyer, addr.buyer, P.all);
  check('four-licence partner supplies a retail order', r.status === 201 && await sentTo(r, V.all), r.json);
  r = await order(t.retailer, addr.retailer, P.all);
  check('four-licence partner supplies a trade order', r.status === 201 && await sentTo(r, V.all), r.json);
  r = await order(t.buyer, addr.buyer, P.mix, 15);
  check('retail order above the retail partner\'s 10 refused (shown stock = suppliable stock)', r.status === 400, r.json);
  r = await order(t.buyer, addr.buyer, P.mix, 2);
  check('mixed product, retail → retail partner (the nearer, unlicensed store skipped)', r.status === 201 && await sentTo(r, V.retail), r.json);
  r = await order(t.retailer, addr.retailer, P.mix, 2);
  check('mixed product, trade → wholesale partner', r.status === 201 && await sentTo(r, V.trade), r.json);

  console.log('\nA. Dawabag\'s own stock follows its licence register (C-07)');
  r = await call('GET', '/admin/selling-rights', { token: t.admin });
  check('selling rights: Dawabag may sell retail and trade', r.json.data?.dawabag?.retail === true && r.json.data?.dawabag?.trade === true, r.json);
  const none = r.json.data?.warnings?.find((w) => w.code === 'partner_no_rights' && /S32 Otherlicence Store/.test(w.message));
  check('dashboard warns: a partner with listings but no 20/21/20B/21B sells to nobody', !!none && none.link === `/admin/partners/${V.none}`, r.json.data?.warnings);
  const rp = r.json.data?.partners?.find((p) => p.id === V.retail);
  check('selling rights per partner', rp?.retail === true && rp?.trade === false
    && r.json.data.partners.find((p) => p.id === V.all)?.trade === true, r.json.data?.partners);
  r = await call('GET', '/admin/selling-rights', { token: t.pharmacist });
  check('selling rights are for admins', r.status === 403, r.json);

  const paused = (await q(`UPDATE business_licences SET is_active = FALSE
     WHERE is_active AND licence_type IN ('wholesale_20b', 'wholesale_21b') RETURNING id`)).map((x) => x.id);
  try {
    trade = await search(t.retailer);
    buyer = await search(t.buyer);
    check('no wholesale licence in the register: own stock NOT offered to the trade buyer', stockIn(trade, 'S32-OWN') === 0);
    check('… still offered to the retail buyer', stockIn(buyer, 'S32-OWN') === 200);
    r = await order(t.retailer, addr.retailer, P.own);
    check('… and a trade order for it is blocked', r.status === 400 && /Insufficient stock/.test(r.json.message), r.json);
    r = await call('GET', '/admin/selling-rights', { token: t.admin });
    const w = r.json.data?.warnings?.find((x) => x.code === 'dawabag_no_trade_licence');
    check('admin dashboard warning names the missing wholesale licence', r.json.data?.dawabag?.trade === false
      && /not offered to trade buyers/.test(w?.message ?? '') && /Form 20B or 21B/.test(w?.message ?? '') && w?.link === '/admin/licences', r.json.data);
  } finally {
    if (paused.length) await q('UPDATE business_licences SET is_active = TRUE WHERE id = ANY($1)', [paused]);
  }
  r = await order(t.retailer, addr.retailer, P.own);
  check('register restored: trade order from own stock goes to Dawabag', r.status === 201 && await sentTo(r, null), r.json);
}

export async function livePrices({ t, P, ids }) {
  console.log('\nB. Trade prices follow the buyer\'s licence live');
  let r = await call('GET', '/users/me/trade-prices', { token: t.retailer });
  check('licence in date: trade prices, not paused', r.json.data?.paused === false && r.json.data?.pricing_type === 'b2b_retailer', r.json);
  r = await call('GET', `/products/${P.own}`, { token: t.retailer });
  check('product page shows PTR', r.json.data?.price_paise === 7500, r.json.data?.price_paise);

  // The licence lapsed yesterday; KYC is still 'approved' (the nightly job has not run)
  await q(`UPDATE party_licences SET valid_upto = CURRENT_DATE - 1 WHERE user_id = $1`, [ids.retailer]);
  const yesterday = (await q(`SELECT to_char(CURRENT_DATE - 1, 'YYYY-MM-DD') AS d`))[0].d;
  r = await call('GET', '/users/me/trade-prices', { token: t.retailer });
  check('lapsed today: trade prices paused at once, naming the licence', r.json.data?.paused === true && r.json.data?.pricing_type === 'customer'
    && r.json.data?.licence?.label === 'Form 20' && r.json.data?.licence?.licence_number === 'S32-RT-20-0001'
    && r.json.data?.licence?.expired_on === yesterday, r.json);
  check('… KYC untouched (nightly job not run)', (await q('SELECT kyc_status FROM users WHERE id = $1', [ids.retailer]))[0].kyc_status === 'approved');
  r = await call('GET', `/products/${P.own}`, { token: t.retailer });
  check('product page: retail price', r.json.data?.price_paise === 9000, r.json.data?.price_paise);
  const s = await search(t.retailer);
  check('search: retail price', s.get('S32-OWN')?.display_price_paise === 9000, s.get('S32-OWN'));
  await call('PUT', `/cart/items/${P.own}`, { token: t.retailer, body: { quantity: 2 } });
  r = await call('GET', '/cart', { token: t.retailer });
  check('cart: retail price and pricing type', r.json.data?.pricing_type === 'customer'
    && r.json.data?.items?.find((i) => i.product_id === P.own)?.unit_price_paise === 9000, r.json.data);
  const addrId = (await q('SELECT id FROM addresses WHERE user_id = $1', [ids.retailer]))[0].id;
  r = await call('POST', '/orders/preview', { token: t.retailer, body: { address_id: addrId, pincode: PIN, items: [{ product_id: P.own, quantity: 2 }] } });
  check('checkout: the order is refused with the licence named (C-14)', r.status === 403 && /Trade orders are paused/.test(r.json.message), r.json);
  r = await call('GET', '/users/me/trade-prices', { token: t.buyer });
  check('a consumer is never paused', r.json.data?.paused === false && r.json.data?.licence === null, r.json);

  // Renewal checked → trade prices again
  await q(`UPDATE party_licences SET valid_upto = CURRENT_DATE + 365 WHERE user_id = $1`, [ids.retailer]);
  r = await call('GET', '/users/me/trade-prices', { token: t.retailer });
  check('renewal checked: trade prices back', r.json.data?.paused === false && r.json.data?.pricing_type === 'b2b_retailer', r.json);
  r = await call('GET', '/cart', { token: t.retailer });
  check('cart back on PTR', r.json.data?.items?.find((i) => i.product_id === P.own)?.unit_price_paise === 7500, r.json.data?.items);
  await call('DELETE', '/cart', { token: t.retailer });
}
