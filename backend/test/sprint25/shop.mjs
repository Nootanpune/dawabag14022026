// Sprint 25 — shop like Amazon: search sort and "did you mean", the cart's "Buy
// again" and "Cheaper option with the same medicine", and a prescription uploaded
// on its own (no order) that is picked at checkout.
// Test data: SKUs S25-, category 'S25 Smoke', mobile 900000250x, PIN 499925; removed by cleanup().
import { call, check, login, q, signUp, API } from '../sprint5/lib.mjs';

export const PIN = '499925';
const CATEGORY = 'S25 Smoke';
const person = (mobile, name) => ({ customer_type: 'customer', full_name: name, mobile, password: 'Passw0rd!',
  accept_privacy_notice: true, age_confirmed: true });
const buyer = person('9000002501', 'S25 Buyer');
const other = person('9000002502', 'S25 Other');
// [key, sku, name, generic, schedule, price (paise), stock, pack]
const PRODUCTS = [
  ['brand', 'S25-BRAND', 'Febrinol 650 Tablet', 'Quinofenol', 'OTC', 3000, 50, '15 tablets'],
  ['gen', 'S25-GEN', 'Quinofenol 650 mg Tablet', 'Quinofenol', 'OTC', 2000, 50, '15 tablets'],
  ['gen500', 'S25-GEN500', 'Quinofenol 500 mg Tablet', 'Quinofenol', 'OTC', 1000, 50, '15 tablets'],
  ['genOut', 'S25-GENOUT', 'Quinofenol 650 mg Tablet (out)', 'Quinofenol', 'OTC', 1500, 0, '15 tablets'],
  ['genPack', 'S25-GENPACK', 'Pyroquin 650 Tablet', 'Quinofenol', 'OTC', 1200, 50, '10 tablets'],
  ['rx', 'S25-RX', 'Zentacillin 500 Capsule', 'Zentacillin', 'Schedule H', 5000, 20, '10 capsules'],
];
const P = {};

export async function cleanup() {
  const ids = (await q('SELECT id FROM users WHERE mobile = ANY($1)', [[buyer.mobile, other.mobile]])).map((r) => r.id);
  const productIds = (await q(`SELECT id FROM products WHERE sku LIKE 'S25-%'`)).map((r) => r.id);
  const orderIds = (await q('SELECT id FROM orders WHERE user_id = ANY($1)', [ids])).map((r) => r.id);
  const rxIds = (await q('SELECT id FROM prescriptions WHERE user_id = ANY($1)', [ids])).map((r) => r.id);
  await q('UPDATE orders SET requested_prescription_id = NULL WHERE id = ANY($1)', [orderIds]);
  await q('UPDATE order_items SET prescription_id = NULL WHERE order_id = ANY($1)', [orderIds]);
  await q('DELETE FROM prescription_items WHERE prescription_id = ANY($1)', [rxIds]);
  await q('DELETE FROM prescriptions WHERE id = ANY($1)', [rxIds]);
  await q('DELETE FROM payments WHERE order_id = ANY($1)', [orderIds]);
  await q('DELETE FROM order_items WHERE order_id = ANY($1)', [orderIds]);
  await q('DELETE FROM order_shipments WHERE order_id = ANY($1)', [orderIds]);
  await q('UPDATE audit_logs SET performed_by = NULL WHERE performed_by = ANY($1)', [ids]);
  for (const t of ['notification_deliveries', 'cart_items', 'carts', 'notifications', 'orders', 'addresses', 'consent_records', 'audit_logs', 'user_profiles']) {
    await q(`DELETE FROM ${t} WHERE user_id = ANY($1)`, [ids]);
  }
  await q('DELETE FROM users WHERE id = ANY($1)', [ids]);
  await q('DELETE FROM low_stock_alerts WHERE product_id = ANY($1)', [productIds]);
  await q('DELETE FROM inventory_batches WHERE product_id = ANY($1)', [productIds]);
  await q(`DELETE FROM audit_logs WHERE new_value->>'product_id' = ANY($1::text[])`, [productIds]);
  await q('DELETE FROM products WHERE id = ANY($1)', [productIds]);
  await q('DELETE FROM pincode_serviceability WHERE pincode = $1', [PIN]);
}

export async function setup() {
  await q(`INSERT INTO pincode_serviceability (pincode, city, state, latitude, longitude, dawabag_delivery_hours, estimated_days)
           VALUES ($1, 'Nashik', 'Maharashtra', 20.01, 73.79, 12, 1)`, [PIN]);
  for (const [key, sku, name, generic, schedule, price, stock, pack] of PRODUCTS) {
    const [{ id }] = await q(
      `INSERT INTO products (name, generic_name, sku, category, drug_schedule, gst_rate, hsn_code, mrp_paise, offer_price_paise,
                             max_qty_per_order, net_quantity, manufacturer_name, manufacturer_address, country_of_origin, is_active)
       VALUES ($1, $2, $3, $4, $5, 12, '30049099', $6, $6, 10, $7, 'S25 Pharma', 'Plot 25, MIDC Ambad, Nashik', 'India', TRUE)
       RETURNING id`, [name, generic, sku, CATEGORY, schedule, price, pack]);
    P[key] = id;
    if (stock) {
      await q(`INSERT INTO inventory_batches (product_id, batch_number, quantity_available, purchase_price_paise, expiry_date)
               VALUES ($1, 'S25-B1', $2, 500, CURRENT_DATE + 400)`, [id, stock]);
    }
  }
  const t = {};
  for (const [k, p] of [['buyer', buyer], ['other', other]]) {
    const { user_id } = await signUp(p);
    t[`${k}Id`] = user_id;
    t[k] = await login(p);
  }
  t.address = (await q(`INSERT INTO addresses (user_id, full_name, mobile, address_line1, city, state, pincode)
     VALUES ($1, 'S25 Buyer', '9000002599', '25 Lane', 'Nashik', 'Maharashtra', $2) RETURNING id`, [t.buyerId, PIN]))[0].id;
  return t;
}

const prices = (r) => (r.json.data?.products || []).map((p) => p.display_price_paise);
const sorted = (a, dir) => a.every((v, i) => i === 0 || (dir > 0 ? a[i - 1] <= v : a[i - 1] >= v));

export async function runSearchExtras() {
  console.log('\nSearch: sort by price and "did you mean"');
  const browse = (extra) => call('GET', `/products/search?category=${encodeURIComponent(CATEGORY)}&limit=50${extra}`);
  let r = await browse('&sort=price_asc');
  check('sort=price_asc lists the lowest price first', r.status === 200 && prices(r).length === 6 && sorted(prices(r), 1), prices(r));
  r = await browse('&sort=price_desc');
  check('sort=price_desc lists the highest price first', sorted(prices(r), -1) && prices(r)[0] === 5000, prices(r));
  r = await call('GET', `/products/search?q=quinofenol&category=${encodeURIComponent(CATEGORY)}&sort=price_asc`);
  check('a text search can be sorted by price too', r.status === 200 && prices(r).length === 5 && sorted(prices(r), 1), prices(r));
  r = await browse('&sort=nonsense');
  check('an unknown sort falls back to relevance (name order), shape unchanged', r.status === 200
    && r.json.data?.products?.[0]?.name === 'Febrinol 650 Tablet' && r.json.data?.pagination?.total === 6, r.json.data?.pagination);

  r = await call('GET', '/products/search/suggest?q=quinofenl');
  check('"did you mean" offers the generic name for a misspelling', r.status === 200 && r.json.data?.suggestions?.includes('Quinofenol'), r.json);
  r = await call('GET', '/products/search/suggest?q=zz');
  check('too short to suggest → empty list', r.status === 200 && Array.isArray(r.json.data?.suggestions) && r.json.data.suggestions.length === 0, r.json);
  await q(`UPDATE products SET drug_schedule = 'Schedule X' WHERE id = $1`, [P.rx]);
  r = await call('GET', '/products/search/suggest?q=zentacilin');
  check('Schedule X names are never suggested (C-10)', r.status === 200 && !r.json.data?.suggestions?.includes('Zentacillin'), r.json);
  // Sprint 39: moving to Schedule X switched online sale off (fail closed); it stays off until a pharmacist allows it again
  const [off] = await q(`SELECT online_sale_status FROM products WHERE id = $1`, [P.rx]);
  check('… and moving it to Schedule X made it prohibited for online sale', off?.online_sale_status === 'prohibited', off);
  await q(`UPDATE products SET drug_schedule = 'Schedule H', online_sale_status = 'permitted', online_sale_ref = 'Smoke test fixture',
             online_sale_ref_date = CURRENT_DATE WHERE id = $1`, [P.rx]);
  r = await call('GET', '/products/search/suggest?q=zentacilin');
  check('… and are suggested once sellable again', r.json.data?.suggestions?.includes('Zentacillin'), r.json);
}

export async function runCartSuggestions(t) {
  console.log('\nCart: buy again and cheaper option');
  let r = await call('GET', '/cart/buy-again');
  check('buy again needs sign-in', r.status === 401, r.status);
  r = await call('GET', '/cart/buy-again', { token: t.buyer });
  check('no delivered orders → empty buy-again list', r.status === 200 && r.json.data?.products?.length === 0, r.json);

  // A delivered order with GEN500 and BRAND (status set as the delivery flow would)
  r = await call('POST', '/orders', { token: t.buyer, body: { address_id: t.address, pincode: PIN,
    items: [{ product_id: P.gen500, quantity: 1 }, { product_id: P.brand, quantity: 1 }] } });
  const orderId = r.json.data?.order?.id;
  check('order placed', !!orderId, r.json);
  await q(`UPDATE orders SET status = 'delivered', delivered_at = NOW() WHERE id = $1`, [orderId]);
  await call('PUT', `/cart/items/${P.brand}`, { token: t.buyer, body: { quantity: 2 } });

  r = await call('GET', '/cart/buy-again', { token: t.buyer });
  const again = (r.json.data?.products || []).map((p) => p.id);
  check('buy again lists delivered medicines not already in the cart', again.length === 1 && again[0] === P.gen500, again);
  const card = r.json.data?.products?.[0];
  check('… as a card with the buyer price and stock', card?.display_price_paise === 1000 && card?.in_stock === true
    && 'image_url' in card && card?.requires_prescription === false, card);
  r = await call('GET', '/cart/buy-again', { token: t.other });
  check('another buyer does not see them', r.json.data?.products?.length === 0, r.json);
  await q(`UPDATE products SET drug_schedule = 'Schedule X' WHERE id = $1`, [P.gen500]);
  r = await call('GET', '/cart/buy-again', { token: t.buyer });
  check('Schedule X is never offered again (C-10)', r.json.data?.products?.length === 0, r.json);
  await q(`UPDATE products SET drug_schedule = 'OTC', is_active = FALSE WHERE id = $1`, [P.gen500]);
  r = await call('GET', '/cart/buy-again', { token: t.buyer });
  check('an inactive product is not offered', r.json.data?.products?.length === 0, r.json);
  await q(`UPDATE products SET is_active = TRUE WHERE id = $1`, [P.gen500]);

  r = await call('GET', '/cart/cheaper-options', { token: t.buyer });
  const opts = r.json.data?.options || [];
  check('cheaper option: same generic, strength and pack, in stock, lower price', r.status === 200 && opts.length === 1
    && opts[0].for_product_id === P.brand && opts[0].product?.id === P.gen && opts[0].saving_paise === 1000, opts);
  check('… never another strength, an out-of-stock one or another pack size',
    !opts.some((o) => [P.gen500, P.genOut, P.genPack].includes(o.product?.id)), opts.map((o) => o.product?.sku));
  r = await call('GET', '/cart', { token: t.buyer });
  check('the cart itself is unchanged (suggestion only)', r.json.data?.items?.length === 1 && r.json.data.items[0].product_id === P.brand
    && r.json.data.items[0].quantity === 2, r.json.data?.items);
  await call('PUT', `/cart/items/${P.gen}`, { token: t.buyer, body: { quantity: 1 } });
  r = await call('GET', '/cart/cheaper-options', { token: t.buyer });
  check('no suggestion once the cheaper one is in the cart', r.json.data?.options?.length === 0, r.json);
  await call('DELETE', '/cart', { token: t.buyer });
}

const pngBlob = () => new Blob([Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000'
  + '1f15c4890000000d49444154789c6360000002000100e221bc330000000049454e44ae426082', 'hex')], { type: 'image/png' });

async function upload(token, orderId) {
  const form = new FormData();
  form.append('prescription', pngBlob(), 'rx.png');
  if (orderId) form.append('order_id', orderId);
  const res = await fetch(`${API}/prescriptions/upload`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

export async function runStandalonePrescription(t) {
  console.log('\nPrescription uploaded on its own, then picked at checkout (C-08)');
  let r = await upload(t.buyer);
  let rxId = r.json.data?.id;
  if (r.status === 503) {
    check('no object store → upload refused, nothing stored locally', true);
    rxId = (await q(`INSERT INTO prescriptions (user_id, s3_key, file_type) VALUES ($1, 'test/s25.png', 'png') RETURNING id`, [t.buyerId]))[0].id;
  } else {
    check('upload without an order → 201, waiting for the pharmacist', r.status === 201 && r.json.data?.status === 'pending', r.json);
  }
  r = await call('GET', '/prescriptions/my', { token: t.buyer });
  const mine = (r.json.data || []).find((p) => p.id === rxId);
  check('listed under my prescriptions with its status and file type', mine?.status === 'pending' && mine?.order_id === null
    && mine?.file_type === 'png', mine);
  r = await call('GET', `/prescriptions/${rxId}/url`, { token: t.other });
  check('another buyer cannot open it', r.status === 403, r.status);

  // Sprint 39: the prescription goes WITH the order — without one the order is refused (C-08)
  const rxBody = { address_id: t.address, pincode: PIN, items: [{ product_id: P.rx, quantity: 1 }] };
  r = await call('POST', '/orders', { token: t.buyer, body: rxBody, noAutoRx: true });
  check('a prescription order without a prescription is refused (422 PRESCRIPTION_REQUIRED)', r.status === 422 && r.json.code === 'PRESCRIPTION_REQUIRED', r.json);
  r = await call('POST', '/orders', { token: t.buyer, body: { ...rxBody, prescription_id: rxId } });
  const orderId = r.json.data?.order?.id;
  check('order with a prescription medicine placed, the saved upload chosen at checkout', !!orderId
    && r.json.data?.order?.prescription?.status === 'awaiting_pharmacist', r.json);
  r = await call('POST', `/prescriptions/${rxId}/use-for-order`, { token: t.other, body: { order_id: orderId } });
  check('someone else cannot use it', r.status === 404, r.json);
  const [row] = await q('SELECT order_id, status FROM prescriptions WHERE id = $1', [rxId]);
  check('the unchecked upload is attached to the order for the pharmacist (order set, still pending)', row.order_id === orderId && row.status === 'pending', row);
  r = await call('POST', '/orders', { token: t.buyer, body: { ...rxBody, prescription_id: rxId } });
  check('an unchecked prescription already with an order cannot be sent with another (order not placed)', r.status === 409, r.json);
  r = await call('POST', '/orders', { token: t.buyer, body: rxBody });
  const order2 = r.json.data?.order?.id;
  await q(`UPDATE prescriptions SET status = 'rejected' WHERE id = $1`, [rxId]);
  r = await call('POST', `/prescriptions/${rxId}/use-for-order`, { token: t.buyer, body: { order_id: order2 } });
  check('a rejected prescription cannot be reused', r.status === 400, r.json);
}
