// Sprint 23 — search that forgives typos and finds medicines by generic name, and
// the public free-delivery amount for the home pages.
// Test data: SKUs S23-, category 'S23 Smoke', mobile 9000002301; removed by cleanup().
import { call, check, login, q, signUp } from '../sprint5/lib.mjs';

const CATEGORY = 'S23 Smoke';
const admin = { customer_type: 'customer', full_name: 'S23 Owner', mobile: '9000002301', password: 'Passw0rd!',
  accept_privacy_notice: true, age_confirmed: true };
// [sku, name, generic, schedule, units in stock]
const PRODUCTS = [
  ['S23-DOLO650', 'Dolo 650 Tablet', 'Paracetamol', 'OTC', 0],
  ['S23-DOLO500', 'Dolo 500 Tablet', 'Paracetamol', 'OTC', 40],
  ['S23-DOLO1000', 'Dolo 1000 Tablet', 'Paracetamol', 'OTC', 0],
  ['S23-PANTOZEL', 'Pantozel 40 Tablet', 'Pantoprazole', 'Schedule H', 25],
  ['S23-MOKCILIN', 'Mokcilin 500 Capsule', 'Amoxicillin', 'Schedule H', 30],
  ['S23-XENO', 'Xenoproxil 5 Tablet', 'Xenoproxilate', 'Schedule X', 10],
];

export async function cleanup() {
  await q(`DELETE FROM inventory_batches WHERE product_id IN (SELECT id FROM products WHERE sku LIKE 'S23-%')`);
  await q(`DELETE FROM products WHERE sku LIKE 'S23-%'`);
  const ids = (await q('SELECT id FROM users WHERE mobile = $1', [admin.mobile])).map((r) => r.id);
  await q('UPDATE audit_logs SET performed_by = NULL WHERE performed_by = ANY($1)', [ids]);
  await q('UPDATE app_settings SET updated_by = NULL WHERE updated_by = ANY($1)', [ids]);
  for (const t of ['notifications', 'consent_records', 'audit_logs', 'user_profiles']) await q(`DELETE FROM ${t} WHERE user_id = ANY($1)`, [ids]);
  await q('DELETE FROM users WHERE id = ANY($1)', [ids]);
}

export async function setup() {
  for (const [sku, name, generic, schedule, stock] of PRODUCTS) {
    const [{ id }] = await q(
      `INSERT INTO products (name, generic_name, sku, category, drug_schedule, gst_rate, hsn_code, mrp_paise, offer_price_paise,
                             max_qty_per_order, net_quantity, manufacturer_name, manufacturer_address, country_of_origin, is_active)
       VALUES ($1, $2, $3, $4, $5, 12, '30049099', 3000, 2700, 10, '10 tablets', 'S23 Pharma', 'Plot 23, MIDC Ambad, Nashik', 'India', TRUE)
       RETURNING id`, [name, generic, sku, CATEGORY, schedule]);
    if (stock) {
      await q(`INSERT INTO inventory_batches (product_id, batch_number, quantity_available, purchase_price_paise, expiry_date)
               VALUES ($1, 'S23-B1', $2, 2000, CURRENT_DATE + 400)`, [id, stock]);
    }
  }
}

const search = async (text, extra = '') =>
  (await call('GET', `/products/search?q=${encodeURIComponent(text)}${extra.includes('limit=') ? '' : '&limit=50'}${extra}`)).json;
/** This run's products in the order the API ranked them. */
const ours = (res) => (res.data?.products || []).filter((p) => p.sku.startsWith('S23-')).map((p) => p.sku);

export async function runSearch() {
  console.log('\nSearch: typos, generic names, partial words, ranking');
  let r = await search('dollo 650');
  check('misspelled brand ("dollo 650") finds Dolo 650', ours(r)[0] === 'S23-DOLO650', ours(r));
  r = await search('mokcillin');
  check('misspelled brand ("mokcillin") finds Mokcilin', ours(r).includes('S23-MOKCILIN'), ours(r));
  r = await search('amoxicillin');
  check('generic name finds the brand (amoxicillin → Mokcilin)', ours(r).includes('S23-MOKCILIN'), ours(r));
  r = await search('amoxycillin');
  check('misspelled generic ("amoxycillin") finds the brand', ours(r).includes('S23-MOKCILIN'), ours(r));
  r = await search('paracetamol');
  check('generic name finds every brand of it', ['S23-DOLO650', 'S23-DOLO500', 'S23-DOLO1000'].every((s) => ours(r).includes(s)), ours(r));
  r = await search('pantoz');
  check('partial word ("pantoz") finds Pantozel', ours(r).includes('S23-PANTOZEL'), ours(r));
  r = await search('dolo 650');
  check('"dolo 650" ranks Dolo 650 above Dolo 500 (although 500 is in stock)',
    ours(r).indexOf('S23-DOLO650') === 0 && ours(r).indexOf('S23-DOLO500') > 0, ours(r));
  r = await search('dolo 65');
  check('"dolo 65" also puts Dolo 650 first', ours(r)[0] === 'S23-DOLO650', ours(r));
  r = await search('dolo');
  check('equal matches: in stock first (Dolo 500 before Dolo 1000 and 650)',
    ours(r)[0] === 'S23-DOLO500' && ours(r).length === 3, ours(r));
  const p = r.data?.products?.find((x) => x.sku === 'S23-DOLO500');
  check('result shape unchanged (price, stock, photo, discount)', p && p.in_stock === true && p.display_price_paise === 2700
    && p.discount_pct === 10 && 'image_url' in p && 'stock_qty' in p && 'min_order_qty' in p, p);

  // Schedule X / NDPS are never listed, however they are searched (C-10)
  for (const text of ['xenoproxil', 'xenoproxl', 'xenoproxilate']) {
    r = await search(text);
    check(`Schedule X never returned ("${text}")`, !ours(r).includes('S23-XENO'), ours(r));
  }
  r = await search('', `&category=${encodeURIComponent(CATEGORY)}`);
  check('Schedule X not listed when browsing its category either', r.data?.pagination?.total === 5 && !ours(r).includes('S23-XENO'), r.data?.pagination);

  r = await search('qzxwvkj');
  check('nonsense query returns nothing', r.success && r.data?.products?.length === 0 && r.data?.pagination?.total === 0, r.data);
  r = await search('%%%');
  check('punctuation-only query returns nothing (not the whole shop)', r.data?.pagination?.total === 0, r.data?.pagination);

  r = await search('dolo', `&category=${encodeURIComponent(CATEGORY)}&limit=2&page=2`);
  check('pagination: total and pages as before', r.data?.pagination?.total === 3 && r.data?.pagination?.pages === 2
    && r.data?.products?.length === 1, r.data?.pagination);
  r = await search('dolo', `&category=${encodeURIComponent(CATEGORY)}&limit=2&page=5`);
  check('a page past the end still reports the total', r.data?.pagination?.total === 3 && r.data?.products?.length === 0, r.data?.pagination);
}

export async function runDeliveryOffer() {
  console.log('\nFree delivery amount for the home pages');
  const id = (await signUp(admin)).user_id;
  await q(`UPDATE users SET role = 'super_admin' WHERE id = $1`, [id]);
  const token = await login(admin);
  const [{ value: before } = { value: null }] = await q(`SELECT value FROM app_settings WHERE key = 'delivery.free_above_paise'`);
  try {
    let r = await call('PUT', '/admin/settings/delivery.free_above_paise', { token, body: { value: 49900 } });
    check('owner sets ₹499', r.status === 200, r.json);
    const res = await fetch(`${process.env.API_URL || 'http://localhost:4000'}/api/v1/delivery/offer`);
    const body = await res.json();
    check('GET /delivery/offer is public and returns the amount', res.status === 200 && body.data?.free_delivery_above_paise === 49900, body);
    check('… and no one may cache it', res.headers.get('cache-control') === 'no-store', res.headers.get('cache-control'));
    r = await call('PUT', '/admin/settings/delivery.free_above_paise', { token, body: { value: null } });
    r = await call('GET', '/delivery/offer');
    check('null when the owner switches free delivery off', r.status === 200 && r.json.data?.free_delivery_above_paise === null, r.json);
  } finally {
    await call('PUT', '/admin/settings/delivery.free_above_paise', { token, body: { value: before } });
  }
}
