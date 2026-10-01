// Test data for the browser tests: mobiles 90000019xx, SKUs E2E-, pincode 499919.
// Created through the API (as a person would) and removed afterwards; nothing is
// kept on disk — the people and products are handed to the tests in env variables.
import { Client } from 'pg';
import Redis from 'ioredis';

export const API = (process.env.API_URL || 'http://localhost:4000') + '/api/v1';
export const PIN = '499919';
const consent = { accept_privacy_notice: true, age_confirmed: true };
export const people = {
  admin: { customer_type: 'customer', full_name: 'E2E Admin', mobile: '9000001901', password: 'Passw0rd!', ...consent },
  buyer: { customer_type: 'customer', full_name: 'E2E Buyer', mobile: '9000001902', password: 'Passw0rd!', ...consent },
};

export const db = () => new Client({ connectionString: process.env.DATABASE_URL });
export const redis = () => new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

export async function call(method: string, path: string, body?: unknown, token?: string) {
  const res = await fetch(API + path, {
    method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => ({})) as any };
}

export async function cleanup(c: Client) {
  const ids = (await c.query(`SELECT id FROM users WHERE mobile LIKE '90000019%'`)).rows.map((r) => r.id);
  const products = (await c.query(`SELECT id FROM products WHERE sku LIKE 'E2E-%'`)).rows.map((r) => r.id);
  const orders = (await c.query('SELECT id FROM orders WHERE user_id = ANY($1)', [ids])).rows.map((r) => r.id);
  await c.query("SET dawabag.maintenance = 'on'");
  await c.query('DELETE FROM order_items WHERE order_id = ANY($1)', [orders]);
  await c.query('DELETE FROM order_shipments WHERE order_id = ANY($1)', [orders]);
  await c.query('UPDATE audit_logs SET performed_by = NULL WHERE performed_by = ANY($1)', [ids]);
  await c.query('UPDATE app_settings SET updated_by = NULL WHERE updated_by = ANY($1)', [ids]);
  for (const t of ['notification_deliveries', 'user_devices', 'cart_items', 'carts', 'notifications', 'orders', 'addresses', 'consent_records', 'audit_logs', 'user_profiles']) {
    await c.query(`DELETE FROM ${t} WHERE user_id = ANY($1)`, [ids]);
  }
  await c.query('DELETE FROM users WHERE id = ANY($1)', [ids]);
  await c.query('DELETE FROM inventory_batches WHERE product_id = ANY($1)', [products]);
  await c.query(`DELETE FROM audit_logs WHERE new_value->>'product_id' = ANY($1::text[])`, [products]);
  await c.query('DELETE FROM products WHERE id = ANY($1)', [products]);
  await c.query('DELETE FROM pincode_serviceability WHERE pincode = $1', [PIN]);
}
