// Sprint 34 smoke test data — every name and number is made up.
// Mobiles 90000034xx, vendors 'S34 %' (invoice prefixes S34x), SKUs S34-, PIN 499936,
// licence numbers S34-…, categories 'S34 …', HSN codes 993434xx. Removed by cleanup().
import { call, check, login, q, signUp } from '../sprint5/lib.mjs';

export const PIN = '499936';
const consent = { accept_privacy_notice: true, age_confirmed: true };
const person = (mobile, name) => ({ customer_type: 'customer', full_name: name, mobile, password: 'Passw0rd!', ...consent });
export const people = {
  admin: person('9000003401', 'S34 Admin'),
  pharmacist: person('9000003402', 'S34 Pharmacist'),
  buyer: person('9000003403', 'S34 Buyer'),
  retailerA: person('9000003404', 'S34 Retail Owner A'),
  retailerB: person('9000003405', 'S34 Retail Owner B'),
  partnerA: person('9000003406', 'S34 Partner Login A'),
  partnerB: person('9000003407', 'S34 Partner Login B'),
  changer: person('9000003408', 'S34 Password Changer'),
  idle: person('9000003409', 'S34 Idle Buyer'),
};
export const ids = {};
export const t = {};
export const P = {};
export const V = {};
export const addr = {};

export async function cleanup() {
  const userIds = (await q('SELECT id FROM users WHERE mobile = ANY($1)', [Object.values(people).map((p) => p.mobile)])).map((r) => r.id);
  const vendorIds = (await q(`SELECT id FROM vendors WHERE name LIKE 'S34 %'`)).map((r) => r.id);
  const productIds = (await q(`SELECT id FROM products WHERE sku LIKE 'S34-%'`)).map((r) => r.id);
  const orderIds = (await q('SELECT id FROM orders WHERE user_id = ANY($1)', [userIds])).map((r) => r.id);
  await q('DELETE FROM partner_order_items WHERE order_id = ANY($1) OR partner_id = ANY($2)', [orderIds, vendorIds]);
  await q('DELETE FROM payments WHERE order_id = ANY($1)', [orderIds]);
  await q('DELETE FROM order_items WHERE order_id = ANY($1)', [orderIds]);
  await q('DELETE FROM order_shipments WHERE order_id = ANY($1)', [orderIds]);
  await q('DELETE FROM prescriptions WHERE user_id = ANY($1)', [userIds]);
  await q('DELETE FROM orders WHERE id = ANY($1)', [orderIds]);
  await q('UPDATE audit_logs SET performed_by = NULL WHERE performed_by = ANY($1)', [userIds]);
  await q('UPDATE job_runs SET triggered_by = NULL WHERE triggered_by = ANY($1)', [userIds]);
  await q('UPDATE app_settings SET updated_by = NULL WHERE updated_by = ANY($1)', [userIds]);
  await q(`DELETE FROM audit_logs WHERE new_value->>'product_id' = ANY($1::text[]) OR new_value->>'vendor_id' = ANY($2::text[])
           OR new_value->>'name' LIKE 'S34 %' OR new_value->>'code' LIKE '993434%' OR old_value->>'code' LIKE '993434%'`,
  [productIds, vendorIds]);
  await q('DELETE FROM partner_stock_import_rows WHERE import_id IN (SELECT id FROM partner_stock_imports WHERE partner_id = ANY($1))', [vendorIds]);
  await q('DELETE FROM partner_stock_imports WHERE partner_id = ANY($1)', [vendorIds]);
  await q('DELETE FROM partner_import_mappings WHERE partner_id = ANY($1)', [vendorIds]);
  await q('DELETE FROM partner_inventory WHERE partner_id = ANY($1)', [vendorIds]);
  await q('DELETE FROM partner_products WHERE partner_id = ANY($1) OR product_id = ANY($2)', [vendorIds, productIds]);
  for (const tbl of ['notifications', 'consent_records', 'audit_logs', 'addresses', 'cart_items', 'carts', 'medicine_reminders',
    'health_profiles', 'vendor_users']) {
    await q(`DELETE FROM ${tbl} WHERE user_id = ANY($1)`, [userIds]);
  }
  await q('DELETE FROM patients WHERE owner_user_id = ANY($1)', [userIds]);
  await q('DELETE FROM user_profiles WHERE user_id = ANY($1)', [userIds]);
  await q('DELETE FROM vendor_users WHERE vendor_id = ANY($1)', [vendorIds]);
  await q('DELETE FROM vendors WHERE id = ANY($1)', [vendorIds]);              // licences cascade
  await q(`DELETE FROM invoice_series WHERE prefix LIKE 'S34%'`);
  await q('DELETE FROM catalogue_drafts WHERE product_id = ANY($1)', [productIds]);
  await q('DELETE FROM low_stock_alerts WHERE product_id = ANY($1)', [productIds]);
  await q('DELETE FROM inventory_batches WHERE product_id = ANY($1)', [productIds]);
  await q('UPDATE products SET content_reviewed_by = NULL WHERE id = ANY($1)', [productIds]);
  await q('DELETE FROM products WHERE id = ANY($1)', [productIds]);
  await q(`DELETE FROM product_categories WHERE name_key LIKE 's34 %'`);
  await q(`DELETE FROM hsn_codes WHERE code LIKE '993434%'`);
  await q('DELETE FROM users WHERE id = ANY($1)', [userIds]);                  // licences cascade
  await q('DELETE FROM pincode_serviceability WHERE pincode = $1', [PIN]);
}

/** A partner at the buyer's PIN holding exactly these checked licences, with one login. */
async function partner(name, prefix, forms, km, loginUserId) {
  const id = (await q(
    `INSERT INTO vendors (name, drug_license_no, gst_number, pincode, city, state, latitude, longitude, vendor_type, approval_status, is_active, invoice_prefix)
     VALUES ($1, $2, '27ABCDE3434F1Z' || right($5, 1), $3, 'Nashik', 'Maharashtra', $4, 73.7900, 'marketplace_partner', 'approved', TRUE, $5) RETURNING id`,
    [name, `S34-${prefix}`, PIN, 20.0110 + km / 111, prefix]))[0].id;
  for (const f of forms) {
    await q(`INSERT INTO party_licences (vendor_id, form, licence_number, valid_upto, status, verified_at)
             VALUES ($1, $2, $3, CURRENT_DATE + 400, 'verified', NOW())`, [id, f, `S34-${prefix}-${f.toUpperCase()}`]);
  }
  await q(`UPDATE users SET role = 'partner' WHERE id = $1`, [loginUserId]);
  await q('INSERT INTO vendor_users (vendor_id, user_id) VALUES ($1, $2)', [id, loginUserId]);
  return id;
}

export async function stock(partnerId, productId, qty) {
  const pp = (await q(`INSERT INTO partner_products (partner_id, product_id, medicine_name, approval_status, listing_status, catalogue_price_accepted)
     VALUES ($1, $2, 'S34 listing', 'approved', 'live', TRUE) RETURNING id`, [partnerId, productId]))[0].id;
  await q(`INSERT INTO partner_inventory (partner_id, partner_product_id, batch_number, qty_available, expiry_date)
           VALUES ($1, $2, 'S34-PB', $3, CURRENT_DATE + 400)`, [partnerId, pp, qty]);
}

export async function setup() {
  await q(`INSERT INTO pincode_serviceability (pincode, city, state, latitude, longitude, dawabag_delivery_hours, estimated_days)
           VALUES ($1, 'Nashik', 'Maharashtra', 20.0110, 73.7900, 12, 2)`, [PIN]);
  for (const [k, p] of Object.entries(people)) ids[k] = (await signUp(p)).user_id;
  await q(`UPDATE users SET role = 'super_admin' WHERE id = $1`, [ids.admin]);
  await q(`UPDATE users SET role = 'pharmacist_rx', pharmacist_reg_no = 'MSPC-S34-1' WHERE id = $1`, [ids.pharmacist]);
  for (const k of ['retailerA', 'retailerB']) {
    await q(`UPDATE users SET customer_type = 'b2b_retailer', kyc_status = 'approved', business_name = $2 WHERE id = $1`,
      [ids[k], `S34 Test Medical ${k.slice(-1)}`]);
    await q(`INSERT INTO party_licences (user_id, form, licence_number, valid_upto, status, verified_at)
             VALUES ($1, 'dl20', $2, CURRENT_DATE + 300, 'verified', NOW())`, [ids[k], `S34-RT-${k.slice(-1)}-20`]);
  }
  for (const k of ['buyer', 'retailerA']) {
    addr[k] = (await q(`INSERT INTO addresses (user_id, full_name, mobile, address_line1, city, state, pincode, is_default)
       VALUES ($1, 'S34 Test', $2, '34 Lake Road', 'Nashik', 'Maharashtra', $3, TRUE) RETURNING id`, [ids[k], people[k].mobile, PIN]))[0].id;
  }
  V.f20 = await partner('S34 Form Twenty Pharmacy', 'S34A', ['dl20'], 1, ids.partnerA);
  V.f21 = await partner('S34 Form Twentyone Pharmacy', 'S34B', ['dl21'], 2, ids.partnerB);
  for (const [k, p] of Object.entries(people)) t[k] = await login(p);

  const decl = { net_quantity: '1 vial', manufacturer_name: 'S34 Biologicals Ltd', manufacturer_address: 'Plot 34, MIDC Satpur, Nashik 422007',
    country_of_origin: 'India' };
  const mk = async (sku, name, scheduleC) => {
    const r = await call('POST', '/products', { token: t.admin, body: { name, sku, category: 'S34 Smoke', drug_schedule: 'Schedule H',
      gst_rate: 12, hsn_code: '3004', mrp_paise: 10000, offer_price_paise: 9000, ptr_price_paise: 7500, pts_price_paise: 7000,
      max_qty_per_order: 100, schedule_c_c1: scheduleC, ...decl } });
    check(`product ${sku} created${scheduleC ? ' as Schedule C / C1' : ''}`, r.status === 201, r.json);
    return r.json.data?.id;
  };
  P.std = await mk('S34-STD', 'S34 Standardzor 500 Tablet', false);
  P.bio = await mk('S34-BIO', 'S34 Biozulin 40 IU Injection', true);
  P.ownStd = await mk('S34-OWNSTD', 'S34 Ownzor 500 Tablet', false);
  P.ownBio = await mk('S34-OWNBIO', 'S34 Ownvaccine Injection', true);
  // Each partner holds both medicines; distinct quantities show whose stock is counted
  await stock(V.f20, P.std, 11);
  await stock(V.f20, P.bio, 12);
  await stock(V.f21, P.std, 21);
  await stock(V.f21, P.bio, 22);
  for (const [p, qty] of [[P.ownStd, 60], [P.ownBio, 50]]) {
    await q(`INSERT INTO inventory_batches (product_id, batch_number, quantity_available, purchase_price_paise, expiry_date)
             VALUES ($1, 'S34-OWN', $2, 5000, CURRENT_DATE + 400)`, [p, qty]);
  }
}
