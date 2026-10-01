// Load-test data: a catalogue of 500 medicines with stock, one buyer with an
// address, kept apart by the LOAD- SKU prefix and 90000029xx mobiles, and
// removed again by cleanup(). Created in the database directly (bulk), except
// the buyer, who signs up through the API like a person.
import { createRequire } from 'module';
const require = createRequire(new URL('../../backend/package.json', import.meta.url));
const { Client } = require('pg');
const Redis = require('ioredis');

export const API = (process.env.API_URL || 'http://localhost:4000') + '/api/v1';
export const PIN = '499929';
export const BUYER = { customer_type: 'customer', full_name: 'Load Buyer', mobile: '9000002901', password: 'Passw0rd!', accept_privacy_notice: true, age_confirmed: true };
const NAMES = ['Paracetamol', 'Cetirizine', 'Pantoprazole', 'Metformin', 'Amlodipine', 'Azithromycin', 'Ibuprofen', 'Vitamin D3', 'ORS', 'Omeprazole'];

const post = async (path, body, token) => {
  const r = await fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  return { status: r.status, json: await r.json().catch(() => ({})) };
};

export async function cleanup(c) {
  await c.query("SET dawabag.maintenance = 'on'");
  const users = (await c.query(`SELECT id FROM users WHERE mobile LIKE '90000029%'`)).rows.map((r) => r.id);
  for (const t of ['cart_items', 'carts', 'addresses', 'consent_records', 'audit_logs', 'user_profiles', 'notifications']) {
    await c.query(`DELETE FROM ${t} WHERE user_id = ANY($1)`, [users]);
  }
  await c.query('DELETE FROM users WHERE id = ANY($1)', [users]);
  await c.query(`DELETE FROM inventory_batches WHERE product_id IN (SELECT id FROM products WHERE sku LIKE 'LOAD-%')`);
  await c.query(`DELETE FROM products WHERE sku LIKE 'LOAD-%'`);
  await c.query('DELETE FROM pincode_serviceability WHERE pincode = $1', [PIN]);
}

export async function seed() {
  const c = new Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
  const r = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  try {
    await cleanup(c);
    await c.query(`INSERT INTO pincode_serviceability (pincode, city, state, latitude, longitude, dawabag_delivery_hours, estimated_days)
                   VALUES ($1, 'Nashik', 'Maharashtra', 20.01, 73.79, 12, 1)`, [PIN]);
    const ids = (await c.query(
      `INSERT INTO products (name, generic_name, sku, category, drug_schedule, gst_rate, hsn_code, mrp_paise, offer_price_paise, max_qty_per_order,
                             net_quantity, manufacturer_name, manufacturer_address, country_of_origin, is_active)
       SELECT $1::text[] [1 + (g % 10)] || ' ' || (100 + g) || ' mg', $1::text[] [1 + (g % 10)], 'LOAD-' || g, 'Load test', 'OTC', 12, '30049099',
              5000 + g * 10, 4500 + g * 10, 10, '10 tablets', 'Load Pharma Ltd', 'Nashik', 'India', TRUE
       FROM generate_series(1, 500) g RETURNING id`, [NAMES])).rows.map((x) => x.id);
    await c.query(`INSERT INTO inventory_batches (product_id, batch_number, quantity_available, purchase_price_paise, expiry_date)
                   SELECT unnest($1::uuid[]), 'LOAD-B1', 100000, 2000, CURRENT_DATE + 500`, [ids]);
    await post('/auth/register', BUYER);
    const v = await post('/auth/verify-otp', { mobile: BUYER.mobile, otp: await r.get(`otp:${BUYER.mobile}`) });
    const token = v.json.data?.access_token;
    if (!token) throw new Error(`Load buyer sign-up failed: ${JSON.stringify(v.json)}`);
    const address = (await c.query(`INSERT INTO addresses (user_id, full_name, mobile, address_line1, city, state, pincode, is_default)
                   SELECT id, 'Load Buyer', '9000002999', '1 Load Road', 'Nashik', 'Maharashtra', $2, TRUE FROM users WHERE mobile = $1 RETURNING id`,
                   [BUYER.mobile, PIN])).rows[0].id;
    return { productIds: ids, token, address };
  } finally { await c.end(); r.disconnect(); }
}

export async function teardown() {
  const c = new Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
  try { await cleanup(c); } finally { await c.end(); }
}
