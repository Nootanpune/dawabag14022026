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
  pharmacist: { customer_type: 'customer', full_name: 'E2E Pharmacist', mobile: '9000001903', password: 'Passw0rd!', ...consent },
  // Sprint 44: a doctor buying for the clinic (Drugs Rules r.65(9)(b) — written order, verified registration)
  doctor: { customer_type: 'doc_hospital', full_name: 'Dr. E2E Meera Joshi', mobile: '9000001904', password: 'Passw0rd!', pincode: '499919',
    nmc_reg_number: 'MMC-E2E-44', nmc_council_state: 'Maharashtra Medical Council', speciality: 'General Physician', pan_number: 'ABCDE1944J',
    gst_unregistered_declaration: true, practitioner_declaration: true, ...consent },
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

// Deletes rows and, first, every row that points at them through a foreign key
// (found from the database's own constraints), so orders that went through
// prescription check, packing and delivery come out as cleanly as fresh ones
async function removeRows(c: Client, table: string, ids: string[], depth = 0): Promise<void> {
  if (!ids.length || depth > 8) return;
  const fks = (await c.query(
    `SELECT cl.relname AS child, a.attname AS col,
            EXISTS (SELECT 1 FROM pg_attribute x WHERE x.attrelid = cl.oid AND x.attname = 'id' AND NOT x.attisdropped) AS has_id
       FROM pg_constraint k
       JOIN pg_class cl ON cl.oid = k.conrelid
       JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = k.conkey[1]
      WHERE k.contype = 'f' AND k.confrelid = $1::regclass AND array_length(k.conkey, 1) = 1`, [table])).rows;
  for (const fk of fks) {
    if (fk.child === table) continue;
    if (fk.has_id) {
      const childIds = (await c.query(`SELECT id::text FROM ${fk.child} WHERE ${fk.col} = ANY($1)`, [ids])).rows.map((r) => r.id);
      await removeRows(c, fk.child, childIds, depth + 1);
    } else {
      await c.query(`DELETE FROM ${fk.child} WHERE ${fk.col} = ANY($1)`, [ids]);
    }
  }
  await c.query(`DELETE FROM ${table} WHERE id = ANY($1)`, [ids]);
}

export async function cleanup(c: Client) {
  const ids = (await c.query(`SELECT id::text FROM users WHERE mobile LIKE '90000019%'`)).rows.map((r) => r.id);
  const products = (await c.query(`SELECT id::text FROM products WHERE sku LIKE 'E2E-%'`)).rows.map((r) => r.id);
  await c.query("SET ROLE dawabag_maintenance; SET dawabag.maintenance = 'on'");
  // Sprint 42: two-step sign-in back to optional (twoFactor.spec.ts switches it to required)
  await c.query(`UPDATE app_settings SET value = '"optional"' WHERE key = 'security.two_factor'`);
  // Keep the shared trail rows, just unlink them from the test people
  await c.query('UPDATE audit_logs SET performed_by = NULL WHERE performed_by = ANY($1)', [ids]);
  await c.query('UPDATE app_settings SET updated_by = NULL WHERE updated_by = ANY($1)', [ids]);
  // Partner pharmacies of the journeys ('E2E …'): vendors do not hang off a user,
  // and their invoice and credit-note series are keyed by id and prefix
  const vendors = (await c.query(`SELECT id::text, invoice_prefix FROM vendors WHERE name LIKE 'E2E %'`)).rows;
  await c.query('DELETE FROM invoice_series WHERE series_key = ANY($1)',
    [vendors.flatMap((v) => [`P:${v.id}`, ...(v.invoice_prefix ? [`CN:${v.invoice_prefix}-CN`] : [])])]);
  await removeRows(c, 'vendors', vendors.map((v) => v.id));
  await removeRows(c, 'users', ids);
  // Sprint 29: draft products made from the journeys' partner requests (named 'E2E …')
  products.push(...(await c.query(`SELECT product_id::text AS id FROM catalogue_drafts WHERE from_file->>'item_name' LIKE 'E2E %'`)).rows.map((r) => r.id));
  await c.query(`DELETE FROM audit_logs WHERE new_value->>'product_id' = ANY($1::text[])`, [products]);
  await removeRows(c, 'products', products);
  await c.query('DELETE FROM pincode_serviceability WHERE pincode = $1', [PIN]);
}
