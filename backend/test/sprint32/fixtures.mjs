// Sprint 32 test data — every name and number is made up.
// Mobiles 90000032xx, vendors 'S32 %' (invoice prefixes S32x), SKUs S32-, PIN 499932,
// licence numbers S32-…, categories 'S32 …', HSN codes 993232xx.
import { call, check, login, q, signUp } from '../sprint5/lib.mjs';

export const PIN = '499932';
const consent = { accept_privacy_notice: true, age_confirmed: true };
const person = (mobile, name) => ({ customer_type: 'customer', full_name: name, mobile, password: 'Passw0rd!', ...consent });
export const people = {
  admin: person('9000003201', 'S32 Admin'),
  pharmacist: person('9000003202', 'S32 Pharmacist'),
  buyer: person('9000003203', 'S32 Buyer'),
  retailer: person('9000003204', 'S32 Retail Owner'),
};

export async function cleanup() {
  const ids = (await q('SELECT id FROM users WHERE mobile = ANY($1)', [Object.values(people).map((p) => p.mobile)])).map((r) => r.id);
  const vendorIds = (await q(`SELECT id FROM vendors WHERE name LIKE 'S32 %'`)).map((r) => r.id);
  const productIds = (await q(`SELECT id FROM products WHERE sku LIKE 'S32-%'`)).map((r) => r.id);
  const orderIds = (await q('SELECT id FROM orders WHERE user_id = ANY($1)', [ids])).map((r) => r.id);
  await q('DELETE FROM partner_order_items WHERE order_id = ANY($1) OR partner_id = ANY($2)', [orderIds, vendorIds]);
  await q('DELETE FROM credit_note_items WHERE credit_note_id IN (SELECT id FROM credit_notes WHERE order_id = ANY($1))', [orderIds]);
  await q('DELETE FROM credit_notes WHERE order_id = ANY($1)', [orderIds]);
  await q('DELETE FROM payments WHERE order_id = ANY($1)', [orderIds]);
  await q('DELETE FROM order_items WHERE order_id = ANY($1)', [orderIds]);
  await q('DELETE FROM order_shipments WHERE order_id = ANY($1)', [orderIds]);
  await q('DELETE FROM orders WHERE id = ANY($1)', [orderIds]);
  await q(`DELETE FROM audit_logs WHERE new_value->>'product_id' = ANY($1::text[]) OR new_value->>'name' LIKE 'S32 %'
           OR new_value->>'code' LIKE '993232%' OR old_value->>'code' LIKE '993232%'`, [productIds]);
  await q('UPDATE audit_logs SET performed_by = NULL WHERE performed_by = ANY($1)', [ids]);
  await q('DELETE FROM partner_inventory WHERE partner_id = ANY($1)', [vendorIds]);
  await q('DELETE FROM partner_products WHERE partner_id = ANY($1) OR product_id = ANY($2)', [vendorIds, productIds]);
  for (const t of ['notifications', 'consent_records', 'audit_logs', 'addresses', 'cart_items', 'carts', 'user_profiles']) {
    await q(`DELETE FROM ${t} WHERE user_id = ANY($1)`, [ids]);
  }
  await q('DELETE FROM vendors WHERE id = ANY($1)', [vendorIds]);            // licences cascade
  await q(`DELETE FROM invoice_series WHERE prefix LIKE 'S32%'`);
  await q('DELETE FROM cart_items WHERE product_id = ANY($1)', [productIds]);
  await q('DELETE FROM low_stock_alerts WHERE product_id = ANY($1)', [productIds]);
  await q('DELETE FROM inventory_batches WHERE product_id = ANY($1)', [productIds]);
  await q('UPDATE products SET content_reviewed_by = NULL WHERE id = ANY($1)', [productIds]);
  await q('DELETE FROM products WHERE id = ANY($1)', [productIds]);
  await q(`DELETE FROM product_categories WHERE name_key LIKE 's32 %'`);
  await q(`DELETE FROM hsn_codes WHERE code LIKE '993232%'`);
  await q('DELETE FROM users WHERE id = ANY($1)', [ids]);                    // licences cascade
  await q('DELETE FROM pincode_serviceability WHERE pincode = $1', [PIN]);
}

/** A partner at the buyer's PIN holding exactly these checked licences (made-up numbers). */
async function partner(name, prefix, forms, km) {
  const id = (await q(
    `INSERT INTO vendors (name, drug_license_no, gst_number, pincode, city, state, latitude, longitude, vendor_type, approval_status, is_active, invoice_prefix)
     VALUES ($1, $2, '27ABCDE3232F1Z' || right($5, 1), $3, 'Nashik', 'Maharashtra', $4, 73.7900, 'marketplace_partner', 'approved', TRUE, $5) RETURNING id`,
    [name, `S32-${prefix}`, PIN, 20.0110 + km / 111, prefix]))[0].id;
  for (const f of forms) {
    await q(`INSERT INTO party_licences (vendor_id, form, form_name, licence_number, valid_upto, status, verified_at)
             VALUES ($1, $2, $3, $4, CURRENT_DATE + 400, 'verified', NOW())`,
      [id, f, f === 'other' ? 'S32 trade licence (test)' : null, `S32-${prefix}-${f.toUpperCase()}`]);
  }
  return id;
}

async function stock(partnerId, productId, qty) {
  const pp = (await q(`INSERT INTO partner_products (partner_id, product_id, medicine_name, approval_status, listing_status, catalogue_price_accepted)
     VALUES ($1, $2, 'S32 listing', 'approved', 'live', TRUE) RETURNING id`, [partnerId, productId]))[0].id;
  await q(`INSERT INTO partner_inventory (partner_id, partner_product_id, batch_number, qty_available, expiry_date)
           VALUES ($1, $2, 'S32-PB', $3, CURRENT_DATE + 400)`, [partnerId, pp, qty]);
}

export async function setup() {
  await q(`INSERT INTO pincode_serviceability (pincode, city, state, latitude, longitude, dawabag_delivery_hours, estimated_days)
           VALUES ($1, 'Nashik', 'Maharashtra', 20.0110, 73.7900, 12, 2)`, [PIN]);
  const ids = {};
  for (const [k, p] of Object.entries(people)) ids[k] = (await signUp(p)).user_id;
  await q(`UPDATE users SET role = 'super_admin' WHERE id = $1`, [ids.admin]);
  await q(`UPDATE users SET role = 'pharmacist_rx', pharmacist_reg_no = 'MSPC-S32-1' WHERE id = $1`, [ids.pharmacist]);
  // An approved retail pharmacy holding a checked Form 20 (trade prices: PTR)
  await q(`UPDATE users SET customer_type = 'b2b_retailer', kyc_status = 'approved', business_name = 'S32 Test Medical' WHERE id = $1`, [ids.retailer]);
  await q(`INSERT INTO party_licences (user_id, form, licence_number, valid_upto, status, verified_at)
           VALUES ($1, 'dl20', 'S32-RT-20-0001', CURRENT_DATE + 300, 'verified', NOW())`, [ids.retailer]);
  const addr = {};
  for (const k of ['buyer', 'retailer']) {
    addr[k] = (await q(`INSERT INTO addresses (user_id, full_name, mobile, address_line1, city, state, pincode, is_default)
       VALUES ($1, 'S32 Test', $2, '32 Lake Road', 'Nashik', 'Maharashtra', $3, TRUE) RETURNING id`, [ids[k], people[k].mobile, PIN]))[0].id;
  }
  const t = {};
  for (const [k, p] of Object.entries(people)) t[k] = await login(p);

  const decl = { net_quantity: '10 tablets', manufacturer_name: 'S32 Pharma Ltd', manufacturer_address: 'Plot 32, MIDC Satpur, Nashik 422007',
    country_of_origin: 'India' };
  const mk = async (sku, name) => {
    const r = await call('POST', '/products', { token: t.admin, body: { name, sku, category: 'S32 Smoke', drug_schedule: 'OTC',
      gst_rate: 12, hsn_code: '3004', mrp_paise: 10000, offer_price_paise: 9000, ptr_price_paise: 7500, pts_price_paise: 7000,
      max_qty_per_order: 100, ...decl } });
    check(`product ${sku} created`, r.status === 201, r.json);
    return r.json.data?.id;
  };
  const P = {
    ret: await mk('S32-RET', 'S32 Retailonly Tablet'),
    trd: await mk('S32-TRD', 'S32 Tradeonly Tablet'),
    all: await mk('S32-ALL', 'S32 Allforms Tablet'),
    mix: await mk('S32-MIX', 'S32 Mixed Tablet'),
    own: await mk('S32-OWN', 'S32 Ownstock Tablet'),
  };
  await q(`INSERT INTO inventory_batches (product_id, batch_number, quantity_available, purchase_price_paise, expiry_date)
           VALUES ($1, 'S32-B1', 200, 5000, CURRENT_DATE + 400)`, [P.own]);
  const V = {
    retail: await partner('S32 Retail Pharmacy', 'S32R', ['dl20', 'dl21'], 1),
    trade: await partner('S32 Wholesale Agency', 'S32T', ['dl20b', 'dl21b'], 2),
    all: await partner('S32 Fourlicence Pharma', 'S32A', ['dl20', 'dl21', 'dl20b', 'dl21b'], 3),
    none: await partner('S32 Otherlicence Store', 'S32N', ['other'], 4),
  };
  await stock(V.retail, P.ret, 30);
  await stock(V.trade, P.trd, 40);
  await stock(V.all, P.all, 50);
  await stock(V.retail, P.mix, 10);
  await stock(V.trade, P.mix, 20);
  await stock(V.none, P.mix, 90);   // can sell to nobody: never counted
  return { ids, t, P, V, addr };
}
