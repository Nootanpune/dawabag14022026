// Sprint 34 B — Schedule C / C1 per product: Form 21 / 21B for those medicines, Form 20 / 20B
// for the others (Drugs Rules, 1945; services/stock/sellingRights.ts, C-07, C-33)
import { call, check, q } from '../sprint5/lib.mjs';
import { addr, ids, P, PIN, t, V } from './fixtures.mjs';

const search = async (token) => {
  const r = await call('GET', '/products/search?q=S34&limit=50', { token });
  return new Map((r.json.data?.products ?? []).map((p) => [p.sku, Number(p.stock_qty)]));
};
const order = (token, address, productId, quantity = 1) =>
  call('POST', '/orders', { token, body: { address_id: address, pincode: PIN, items: [{ product_id: productId, quantity }] } });
const sentTo = async (r, partnerId) => {
  const id = r.json.data?.order?.id;
  if (!id) return false;
  const s = await q('SELECT seller_type, partner_id FROM order_shipments WHERE order_id = $1', [id]);
  return s.length === 1 && (partnerId ? s[0].partner_id === partnerId : s[0].seller_type === 'dawabag');
};

export async function runScheduleC() {
  console.log('\nB. The pharmacist marks Schedule C / C1 on the product');
  let r = await call('GET', `/products/${P.bio}/admin`, { token: t.admin });
  check('admin record carries schedule_c_c1', r.json.data?.schedule_c_c1 === true, r.json.data?.schedule_c_c1);
  r = await call('GET', `/products/${P.std}/admin`, { token: t.admin });
  check('… false when not marked', r.json.data?.schedule_c_c1 === false, r.json.data?.schedule_c_c1);

  console.log('\nB. Stock shown = what a seller with the RIGHT form holds');
  let buyer = await search(t.buyer);
  check('retail buyer, ordinary medicine: only the Form 20 partner counts (11, not the Form 21 partner\'s 21)', buyer.get('S34-STD') === 11, [...buyer]);
  check('retail buyer, Schedule C / C1 medicine: only the Form 21 partner counts (22, not 12)', buyer.get('S34-BIO') === 22, [...buyer]);
  const anon = await search(undefined);
  check('signed-out shopper sees the same', anon.get('S34-STD') === 11 && anon.get('S34-BIO') === 22);
  const trade = await search(t.retailerA);
  check('trade buyer: neither partner holds 20B / 21B → 0 for both', trade.get('S34-STD') === 0 && trade.get('S34-BIO') === 0, [...trade]);
  r = await call('GET', `/products/${P.bio}`, { token: t.buyer });
  check('product page agrees (22)', r.json.data?.stock_qty === 22, r.json.data?.stock_qty);
  await call('PUT', `/cart/items/${P.bio}`, { token: t.buyer, body: { quantity: 15 } });
  r = await call('GET', '/cart', { token: t.buyer });
  const line = r.json.data?.items?.find((i) => i.product_id === P.bio);
  check('cart agrees (22 available)', line?.stock_qty === 22 && line?.available === true, line);
  await call('DELETE', '/cart', { token: t.buyer });

  console.log('\nB. Allocation supplies only from the seller with the right form');
  r = await order(t.buyer, addr.buyer, P.std, 2);
  check('ordinary medicine → the Form 20 partner (the Form 21 partner is not used)', r.status === 201 && await sentTo(r, V.f20), r.json);
  r = await order(t.buyer, addr.buyer, P.bio, 2);
  check('Schedule C / C1 medicine → the Form 21 partner (the nearer Form 20 partner is skipped)', r.status === 201 && await sentTo(r, V.f21), r.json);
  r = await order(t.buyer, addr.buyer, P.std, 15);
  check('more of the ordinary medicine than the Form 20 partner holds → refused (Form 21 stock not used)', r.status === 400 && /Insufficient stock/.test(r.json.message), r.json);

  console.log('\nB. Dawabag\'s own stock follows its register form by form');
  buyer = await search(t.buyer);
  const ownStd = buyer.get('S34-OWNSTD');
  check('register holds 20 and 21: own stock of both offered', ownStd > 0 && buyer.get('S34-OWNBIO') === 50, [...buyer]);
  const paused = (await q(`UPDATE business_licences SET is_active = FALSE WHERE is_active AND licence_type = 'retail_21' RETURNING id`)).map((x) => x.id);
  try {
    buyer = await search(t.buyer);
    check('no Form 21 in the register: own Schedule C / C1 stock NOT offered to retail buyers', buyer.get('S34-OWNBIO') === 0, [...buyer]);
    check('… ordinary own stock still offered', buyer.get('S34-OWNSTD') === ownStd, [...buyer]);
    r = await order(t.buyer, addr.buyer, P.ownBio);
    check('… and an order for it is blocked', r.status === 400 && /Insufficient stock/.test(r.json.message), r.json);
    r = await call('GET', '/admin/selling-rights', { token: t.admin });
    const w = r.json.data?.warnings?.find((x) => x.code === 'dawabag_no_form_21');
    check('admin dashboard names the missing Form 21', /Schedule C \/ C1/.test(w?.message ?? '') && /Form 21/.test(w?.message ?? '')
      && r.json.data?.dawabag_forms?.retail?.schedule_c === false && r.json.data?.dawabag_forms?.retail?.other === true, r.json.data);
    const f20 = r.json.data?.partners?.find((p) => p.id === V.f20);
    check('per partner: Form 20 only → ordinary retail yes, Schedule C / C1 no', f20?.forms?.retail?.other === true && f20?.forms?.retail?.schedule_c === false, f20);
  } finally {
    if (paused.length) await q('UPDATE business_licences SET is_active = TRUE WHERE id = ANY($1)', [paused]);
  }
  r = await order(t.buyer, addr.buyer, P.ownBio);
  check('register restored: the order goes to Dawabag', r.status === 201 && await sentTo(r, null), r.json);

  console.log('\nB. Unmarking is audited and takes effect at once');
  r = await call('PATCH', `/products/${P.bio}`, { token: t.admin, body: { schedule_c_c1: false } });
  check('admin unmarks Schedule C / C1', r.status === 200, r.json);
  buyer = await search(t.buyer);
  check('now an ordinary medicine: the Form 20 partner\'s 12 counts', buyer.get('S34-BIO') === 12, [...buyer]);
  const audit = await q(`SELECT old_value, new_value FROM audit_logs WHERE action = 'product_updated' AND new_value->>'product_id' = $1
                         ORDER BY created_at DESC LIMIT 1`, [P.bio]);
  check('audit names the change (C-46)', audit[0]?.old_value?.schedule_c_c1 === true && audit[0]?.new_value?.schedule_c_c1 === false, audit);
  await call('PATCH', `/products/${P.bio}`, { token: t.admin, body: { schedule_c_c1: true } });

  console.log('\nB. "New products to complete": the pharmacist sets it on a draft');
  const draft = (await q(`INSERT INTO products (sku, name, catalogue_state, is_active, mrp_paise, offer_price_paise, content_status)
     VALUES ('S34-DRAFT', 'S34 Draftvaccine Injection', 'draft', FALSE, 20000, 20000, 'pending_review') RETURNING id`))[0].id;
  await q(`INSERT INTO catalogue_drafts (product_id, from_file) VALUES ($1, '{"item_name": "S34 DRAFTVACCINE INJ"}')`, [draft]);
  r = await call('PATCH', `/catalogue-drafts/${draft}`, { token: t.pharmacist, body: { schedule_c_c1: true } });
  check('saved on the draft', r.status === 200 && r.json.data?.schedule_c_c1 === true, r.json);
  const saved = await q(`SELECT new_value FROM audit_logs WHERE action = 'catalogue_draft_saved' AND new_value->>'product_id' = $1`, [draft]);
  check('… and audited', saved.some((a) => a.new_value?.schedule_c_c1 === true), saved);
  r = await call('PATCH', `/catalogue-drafts/${draft}`, { token: t.pharmacist, body: { schedule_c_c1: 'maybe' } });
  check('only yes / no', r.status === 422, r.json);
  void ids;
}
