// Sprint 20 — retail free delivery from the owner's amount (setting
// delivery.free_above_paise, ₹499 by default): order pricing and the cart's progress line
import { call, check } from './lib.mjs';
import { PIN } from './fixtures.mjs';

export async function runFreeDelivery({ t, P, addr }) {
  console.log('Free delivery above the set amount (Sprint 20)');
  const preview = async (qty) => (await call('POST', '/orders/preview', { token: t.buyer,
    body: { address_id: addr.buyer, pincode: PIN, items: [{ product_id: P.own, quantity: qty }] } })).json.data?.charges;
  let r = await call('PUT', '/admin/settings/delivery.free_above_paise', { token: t.admin, body: { value: 49900 } });
  check('admin sets free delivery from ₹499', r.status === 200, r.json);
  const below = await preview(5);   // 5 × ₹90 = ₹450
  const above = await preview(6);   // ₹540
  check('₹450 of medicines pays the delivery charge', below?.delivery_paise > 0, below);
  check('₹540 of medicines is delivered free', above?.delivery_paise === 0, above);

  await call('DELETE', '/cart', { token: t.buyer });
  await call('PUT', `/cart/items/${P.own}`, { token: t.buyer, body: { quantity: 5 } });
  r = await call('GET', '/cart', { token: t.buyer });
  check('the cart says how much more is needed for free delivery', r.json.data?.free_delivery?.above_paise === 49900
    && r.json.data.free_delivery.remaining_paise === 49900 - r.json.data.subtotal_paise, r.json.data?.free_delivery);

  r = await call('PUT', '/admin/settings/delivery.free_above_paise', { token: t.admin, body: { value: null } });
  const off = await preview(6);
  r = await call('GET', '/cart', { token: t.buyer });
  check('switched off: delivery is charged and the cart shows no offer', off?.delivery_paise > 0 && r.json.data?.free_delivery === null, { off, cart: r.json.data?.free_delivery });
  r = await call('PUT', '/admin/settings/delivery.free_above_paise', { token: t.admin, body: { value: -1 } });
  check('a negative amount is refused', r.status === 422 || r.status === 400, r.json);
  await call('PUT', '/admin/settings/delivery.free_above_paise', { token: t.admin, body: { value: 49900 } });
  await call('DELETE', '/cart', { token: t.buyer });
}
