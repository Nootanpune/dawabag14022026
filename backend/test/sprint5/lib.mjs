// Shared helpers for the Sprint 5 smoke test
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Client } = require('pg');
const Redis = require('ioredis');
import { applySprint39Defaults, withPrescription } from '../support/sprint39Fixtures.mjs';

export const API = (process.env.API_URL || 'http://localhost:4000') + '/api/v1';
export const ORIGIN = process.env.API_URL || 'http://localhost:4000';
export const db = new Client({ connectionString: process.env.DATABASE_URL });
export const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
export const q = async (sql, params) => (await db.query(sql, params)).rows;

export const state = { failures: 0 };
export function check(name, cond, detail) {
  if (cond) console.log(`  ok   ${name}`);
  else { state.failures++; console.log(`  FAIL ${name}${detail !== undefined ? ' — ' + JSON.stringify(detail).slice(0, 500) : ''}`); }
}

// Sprint 39 stand-ins for the earlier suites (support/sprint39Fixtures.mjs): fixture products
// allowed for online sale, fixture pharmacists verified, a prescription added when checkout
// asks for one. The Sprint 39 suite turns this off (state.sprint39Defaults = false) to test them.
state.sprint39Defaults = true;

export async function call(method, path, opts = {}) {
  if (state.sprint39Defaults && !opts.absolute && db._connected) await applySprint39Defaults(db);
  if (state.sprint39Defaults && method === 'POST' && path === '/orders' && opts.body && !opts.noAutoRx) {
    return withPrescription(db, (body) => rawCall(method, path, { ...opts, body }), opts.body, opts.token);
  }
  return rawCall(method, path, opts);
}

async function rawCall(method, path, { body, token, raw = false, absolute = false } = {}) {
  const h = {};
  if (token) h.Authorization = `Bearer ${token}`;
  if (body !== undefined) h['Content-Type'] = 'application/json';
  const res = await fetch((absolute ? ORIGIN : API) + path, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
  if (raw) return { status: res.status, type: res.headers.get('content-type'), buf: Buffer.from(await res.arrayBuffer()) };
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

export async function signUp(p) {
  await call('POST', '/auth/register', { body: p });
  const otp = await redis.get(`otp:${p.mobile}`);
  return (await call('POST', '/auth/verify-otp', { body: { mobile: p.mobile, otp } })).json.data;
}
export const login = async (p) => (await call('POST', '/auth/login', { body: { mobile: p.mobile, password: p.password } })).json.data?.access_token;
