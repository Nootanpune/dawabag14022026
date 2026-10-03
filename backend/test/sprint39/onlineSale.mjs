// Sprint 39 — online-sale status per product (owner decision 2026-10-03; handover D4 / D5;
// C-10, C-46): new products start restricted; only a pharmacist allows (with a dated
// reference); buyers see and buy only permitted products; Schedule X / NDPS never permitted
// (database CHECK); the log is append-only; the draft completion form sets it.
import { call, check, q } from '../sprint5/lib.mjs';
import { P, PIN, V, addr, ids, newProduct, permit, placeOrder, plainClient, t, today } from './fixtures.mjs';
import { waitFor } from './rxPayment.mjs';

const search = async (name) => (await call('GET', `/products/search?q=${encodeURIComponent(name)}&limit=10`, { token: t.buyer })).json.data?.products ?? [];
const status = async (id) => (await q(`SELECT online_sale_status, online_sale_ref, online_sale_set_by FROM products WHERE id = $1`, [id]))[0];
const setStatus = (id, body, token = t.pharmacist) => call('PUT', `/online-sale/products/${id}`, { token, body });

export async function runOnlineSaleStatus() {
  console.log('\nOnline-sale status: new products start restricted (C-10)');
  const fresh = await newProduct('S39-NEW');
  check('a new product from the admin\'s form is "restricted"', fresh.online_sale_status === 'restricted', fresh);
  await q(`INSERT INTO inventory_batches (product_id, batch_number, quantity_available, purchase_price_paise, expiry_date)
           VALUES ($1, 'S39-NB1', 50, 5000, CURRENT_DATE + 400)`, [fresh.id]);
  check('… not listed in search', !(await search('S39 S39-NEW')).some((p) => p.id === fresh.id));
  let r = await call('GET', `/products/${fresh.id}`, { token: t.buyer });
  check('… no product page', r.status === 404, r.status);
  r = await call('PUT', `/cart/items/${fresh.id}`, { token: t.buyer, body: { quantity: 1 } });
  check('… cannot be added to the cart (403 NOT_FOR_ONLINE_SALE)', r.status === 403 && r.json.code === 'NOT_FOR_ONLINE_SALE', r.json);
  r = await call('POST', '/orders', { token: t.buyer, body: { address_id: addr.buyer, pincode: PIN, items: [{ product_id: fresh.id, quantity: 1 }] } });
  check('… and an order for it is refused', r.status === 403 && r.json.code === 'NOT_FOR_ONLINE_SALE', r.json);

  r = await setStatus(fresh.id, { status: 'permitted', notification_ref: 'S39 ref', notification_date: today() }, t.opsAdmin);
  check('an admin cannot allow online sale (pharmacist only)', r.status === 400 && /pharmacist/.test(r.json.message), r.json);
  r = await setStatus(fresh.id, { status: 'permitted' });
  check('a pharmacist must give a dated notification / approval reference', r.status === 400 && /reference/.test(r.json.message), r.json);
  r = await setStatus(fresh.id, { status: 'permitted', notification_ref: 'S39 Gazette ref 7', notification_date: '2099-01-01' });
  check('… not a future date', r.status === 400 && /future/.test(r.json.message), r.json);
  r = await setStatus(fresh.id, { status: 'permitted', notification_ref: 'S39 Gazette ref 7', notification_date: today() });
  const st = await status(fresh.id);
  check('the pharmacist allows it with a dated reference', r.status === 200 && st.online_sale_status === 'permitted'
    && st.online_sale_ref === 'S39 Gazette ref 7' && st.online_sale_set_by === ids.pharmacist, { r: r.json, st });
  check('… now it is listed and can go in the cart', (await search('S39 S39-NEW')).some((p) => p.id === fresh.id)
    && (await call('PUT', `/cart/items/${fresh.id}`, { token: t.buyer, body: { quantity: 1 } })).status < 300);
  r = await call('GET', `/online-sale/products/${fresh.id}/log`, { token: t.opsAdmin });
  check('the history shows restricted → permitted with who, reference and date', r.status === 200
    && r.json.data?.[0]?.new_status === 'permitted' && r.json.data[0].old_status === 'restricted' && r.json.data[0].notification_ref === 'S39 Gazette ref 7'
    && r.json.data[0].set_by_name === 'S39 Pharmacist', r.json.data?.[0]);
  r = await call('GET', '/online-sale/products?status=restricted', { token: t.buyer });
  check('buyers cannot use the staff screen', r.status === 403, r.status);

  console.log('\nStopping a product (admin or pharmacist) stops every seller at once; partners are told');
  r = await call('POST', '/online-sale/products/bulk', { token: t.opsAdmin, body: { product_ids: [fresh.id, P.feed], status: 'prohibited' } });
  check('a stop needs a reason', r.status === 400 && /why/.test(r.json.message), r.json);
  r = await call('POST', '/online-sale/products/bulk', { token: t.opsAdmin,
    body: { product_ids: [fresh.id, P.feed], status: 'prohibited', reason: 'S39 test: banned by a notification', notification_ref: 'S39 GSR 1', notification_date: today() } });
  check('the admin prohibits two products in one go', r.status === 200 && r.json.data?.updated === 2
    && (await status(P.feed)).online_sale_status === 'prohibited', r.json);
  r = await call('GET', '/cart', { token: t.buyer });
  const line = r.json.data?.items?.find((i) => i.product_id === fresh.id);
  check('the cart line shows "Not available for online sale"', line?.available === false && /online sale/.test(line?.issue ?? ''), line);
  await call('DELETE', '/cart', { token: t.buyer });
  check('the partner listing the product is told it was switched off', (await waitFor(() => q(
    `SELECT 1 FROM notifications WHERE user_id = $1 AND type = 'online_sale_status_changed'`, [ids.partner]))).length >= 1);
  await permit([P.feed]);

  console.log('\nSchedule X / NDPS can never be permitted (C-10)');
  const x = await newProduct('S39-X', { drug_schedule: 'Schedule X' });
  r = await setStatus(x.id, { status: 'permitted', notification_ref: 'S39 ref', notification_date: today() });
  check('the API refuses to allow a Schedule X product', r.status === 400 && /never be sold online/.test(r.json.message), r.json);
  const c = await plainClient();
  try {
    let err = null;
    try { await c.query(`UPDATE products SET online_sale_status = 'permitted' WHERE id = $1`, [x.id]); } catch (e) { err = e; }
    check('the database itself refuses (CHECK products_x_ndps_never_permitted)', err?.constraint === 'products_x_ndps_never_permitted', err?.message);
    const other = await newProduct('S39-MOVE');
    await permit([other.id]);
    await c.query(`UPDATE products SET drug_schedule = 'Schedule X' WHERE id = $1`, [other.id]);
    check('a permitted product moved to Schedule X becomes prohibited at once', (await status(other.id)).online_sale_status === 'prohibited');
    err = null;
    try { await c.query(`UPDATE product_online_status_log SET reason = 'changed' WHERE product_id = $1`, [other.id]); } catch (e) { err = e; }
    check('the status log cannot be changed (append-only)', /append-only/.test(err?.message ?? ''), err?.message);
    const logRows = (await q(`SELECT new_status FROM product_online_status_log WHERE product_id = $1 ORDER BY set_at`, [other.id])).map((l) => l.new_status);
    check('every change is in the log, whoever made it (database trigger)', logRows.join(',') === 'permitted,prohibited', logRows);
  } finally { await c.end(); }

  console.log('\nThe pharmacist\'s draft completion form sets the status (approval is not a dead end)');
  const draft = async (sku) => (await q(
    `INSERT INTO products (name, generic_name, sku, category, drug_schedule, gst_rate, hsn_code, mrp_paise, offer_price_paise, max_qty_per_order,
       net_quantity, manufacturer_name, manufacturer_address, country_of_origin, is_active, catalogue_state, strength, dosage_form, cold_chain)
     VALUES ($1, 'Draftamol', $2, 'S39 Smoke', 'OTC', 12, '30049099', 5000, 4500, 5, '10 tablets', 'S39 Remedies Pvt Ltd',
       'Plot 39, MIDC Ambad, Nashik 422010', 'India', FALSE, 'draft', '500 mg', 'Tablet', FALSE) RETURNING id`, [`S39 ${sku}`, sku]))[0].id;
  const d1 = await draft('S39-DRAFT1');
  const d2 = await draft('S39-DRAFT2');
  for (const d of [d1, d2]) await q(`INSERT INTO catalogue_drafts (product_id, from_file, cold_chain_decided) VALUES ($1, '{}', TRUE)`, [d]);
  check('a draft product starts restricted', (await status(d1)).online_sale_status === 'restricted');
  r = await call('POST', `/catalogue-drafts/${d1}/approve`, { token: t.pharmacist,
    body: { online_sale: { status: 'permitted', notification_ref: 'S39 approval note 3', notification_date: today() } } });
  check('approved with "allowed for online sale" in the same form → sellable', r.status === 200 && r.json.data?.sellable === true
    && r.json.data.online_sale_status === 'permitted', r.json);
  r = await call('POST', `/catalogue-drafts/${d2}/approve`, { token: t.pharmacist, body: {} });
  check('approved without the status step → live but restricted (not sold online yet)', r.status === 200 && r.json.data?.sellable === false
    && r.json.data.online_sale_status === 'restricted', r.json);
  void V;
}
