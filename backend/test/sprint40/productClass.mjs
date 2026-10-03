// Sprint 40 — product class and the new-drug flag (handover D6; C-10, C-17): devices are
// never permitted online until a device track exists; a new drug is permitted only with a
// pharmacist's confirmation note; both enforced by the database too.
import { call, check, q } from '../sprint5/lib.mjs';
import { newProduct, permit, plainClient, t } from './fixtures.mjs';

const CONFIRM = 'CDSCO approval for India seen (2025); prescription only; pharmacist checks every order';
const row = async (id) => (await q(`SELECT product_class, is_new_drug, online_sale_status, online_sale_reason, new_drug_confirmation FROM products WHERE id = $1`, [id]))[0];

export async function runProductClass() {
  console.log('\nF. Product class and new drugs (D6, C-10)');
  const existing = (await q(`SELECT COUNT(*)::int AS n FROM products WHERE product_class IS NULL`))[0].n;
  check('every product has a class (existing ones backfilled)', existing === 0);
  const drug = await newProduct('S40-CLS-DRUG');
  check('a new product defaults to class drug, not a new drug', (await row(drug.id)).product_class === 'drug' && (await row(drug.id)).is_new_drug === false);
  const device = await newProduct('S40-CLS-DEV', { product_class: 'device' });
  let r = await permit([device.id]);
  check('a medical device cannot be permitted for online sale (no device track yet)', r.status === 400 && /device track/.test(r.json.message), r.json);
  const plain = await plainClient();
  const err = (sql, p) => plain.query(sql, p).then(() => null, (e) => e.message);
  check('… the database refuses it too', /products_device_not_permitted/.test(await err(`UPDATE products SET online_sale_status = 'permitted' WHERE id = $1`, [device.id]) ?? ''));

  r = await permit([drug.id]);
  check('an ordinary drug is permitted', r.status === 200, r.json);
  r = await call('PATCH', `/products/${drug.id}`, { token: t.admin, body: { product_class: 'device' } });
  let p = await row(drug.id);
  check('reclassified as a device → switched off at once (restricted, reason given)', r.status === 200 && p.online_sale_status === 'restricted'
    && /device/.test(p.online_sale_reason), { r: r.json, p });
  const log = await q(`SELECT new_status FROM product_online_status_log WHERE product_id = $1 ORDER BY set_at DESC LIMIT 1`, [drug.id]);
  check('… and the status log records it', log[0]?.new_status === 'restricted', log);

  const nd = await newProduct('S40-CLS-NEW', { drug_schedule: 'Schedule H', is_new_drug: true });
  r = await permit([nd.id]);
  check('a new drug without a confirmation note is not permitted', r.status === 400 && /new drug/.test(r.json.message), r.json);
  r = await permit([nd.id], { new_drug_confirmation: 'ok' });
  check('… a one-word note is not enough', r.status === 400, r.json);
  check('… the database refuses it without the note', /products_new_drug_confirmed/.test(await err(`UPDATE products SET online_sale_status = 'permitted' WHERE id = $1`, [nd.id]) ?? ''));
  r = await permit([nd.id], { new_drug_confirmation: CONFIRM });
  p = await row(nd.id);
  check('with the pharmacist\'s confirmation it is permitted and the note kept', r.status === 200 && p.online_sale_status === 'permitted' && p.new_drug_confirmation === CONFIRM, { r: r.json, p });
  const ndLog = await q(`SELECT new_drug_confirmation FROM product_online_status_log WHERE product_id = $1 AND new_status = 'permitted'`, [nd.id]);
  check('… the status log keeps the confirmation', ndLog.some((x) => x.new_drug_confirmation === CONFIRM), ndLog);
  r = await permit([nd.id], { new_drug_confirmation: CONFIRM }, t.opsAdmin);
  check('an admin cannot allow (pharmacist only, as before)', r.status === 400 && /pharmacist/.test(r.json.message), r.json);

  const plainDrug = await newProduct('S40-CLS-LATE');
  await permit([plainDrug.id]);
  r = await call('PATCH', `/products/${plainDrug.id}`, { token: t.admin, body: { is_new_drug: true } });
  p = await row(plainDrug.id);
  check('flagged as a new drug later → restricted until a pharmacist confirms', r.status === 200 && p.online_sale_status === 'restricted' && /new drug/i.test(p.online_sale_reason), p);

  r = await call('GET', '/products/admin/list?product_class=device&q=S40-CLS', { token: t.admin });
  check('admin product list filters by class', r.status === 200 && r.json.data.products.length === 2
    && r.json.data.products.every((x) => x.product_class === 'device'), r.json.data?.products?.map((x) => x.sku));
  r = await call('GET', '/products/admin/list?new_drug=1&q=S40-CLS', { token: t.admin });
  check('… and by new drugs', r.status === 200 && r.json.data.products.length === 2 && r.json.data.products.every((x) => x.is_new_drug), r.json.data?.products?.map((x) => x.sku));
  r = await call('POST', '/products', { token: t.admin, body: { name: 'S40 bad class', sku: 'S40-CLS-BAD', category: 'S40 Smoke', drug_schedule: 'OTC', gst_rate: 12,
    mrp_paise: 1000, offer_price_paise: 900, net_quantity: '1', manufacturer_name: 'S40 Remedies', manufacturer_address: 'Plot 40, Nashik 422010', product_class: 'food' } });
  check('an unknown class is refused', r.status === 422 || r.status === 400, r.status);
  await plain.end();
}
