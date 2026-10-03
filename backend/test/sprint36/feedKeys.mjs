// Sprint 36 — partner stock feed: per-partner API keys issued by an admin or the
// partner's owner login; shown once, stored as a hash; scoped to stock upload for one
// partner; rate-limited; revocable; every use audited without the secret (C-44, C-46).
// The upload runs the SAME pipeline as the portal upload (createImport).
import fs from 'fs';
import crypto from 'crypto';
import { API, call, check, q, redis } from '../sprint5/lib.mjs';
import { buildMediVisionWorkbook } from '../fixtures/partnerStockFile.mjs';
import { V, t } from './fixtures.mjs';

const monthStart = (n) => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };
const FILE = [
  { name: 'S36 ALPHAMOLIX 500MG TAB', unit: '10 TAB', com: 'S36R', tax: 12, batches: [
    { batch: 'S36-A1', exp: monthStart(20), purc: 18, ptr: 21, mrp: 30, sale: 26, qty: 30 },
  ] },
  { name: 'S36 UNLISTED THING 5 TAB', unit: '10 TAB', com: 'S36R', tax: 12, batches: [
    { batch: 'S36-U1', exp: monthStart(20), purc: 5, ptr: 6, mrp: 10, sale: 9, qty: 3 },
  ] },
];

async function feed(method, path, { key, file, headers = {} } = {}) {
  const h = { ...headers };
  if (key) h.Authorization = `Bearer ${key}`;
  let body;
  if (file) { body = new FormData(); body.append('file', new Blob([file.buffer]), file.name); }
  const res = await fetch(`${API}/partner-feed${path}`, { method, headers: h, body });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function portalUpload(token, buffer, name) {
  const form = new FormData();
  form.append('file', new Blob([buffer]), name);
  const res = await fetch(`${API}/partner/stock-imports`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
/** JSON with sorted keys (JSONB does not keep key order) */
const canon = (o) => JSON.stringify(Object.fromEntries(Object.entries(o ?? {}).sort(([x], [y]) => x.localeCompare(y))));

export async function runFeedKeys() {
  const secrets = [];
  console.log('\nIssuing keys (admin, or the partner\'s owner login)');
  let r = await call('POST', `/admin/partners/${V.A}/api-keys`, { token: t.admin, body: { label: 'Billing PC, counter 1' } });
  const adminKey = r.json.data;
  check('admin issues a key for Partner A: the secret is shown once in the reply', r.status === 201
    && /^dwbk_[a-z0-9]{10}_[A-Za-z0-9_-]{43}$/.test(adminKey?.secret ?? '') && adminKey.key.scope === 'stock_upload' && adminKey.key.active === true, r.json);
  secrets.push(adminKey.secret);
  const [stored] = await q('SELECT * FROM partner_api_keys WHERE id = $1', [adminKey.key.id]);
  check('only the prefix and the SHA-256 are stored', stored.key_sha256 === sha(adminKey.secret)
    && adminKey.secret.includes(stored.prefix) && !JSON.stringify(stored).includes(adminKey.secret.slice(`dwbk_${stored.prefix}_`.length)), Object.keys(stored));

  r = await call('GET', `/admin/partners/${V.A}/api-keys`, { token: t.admin });
  const listed = JSON.stringify(r.json);
  check('the list shows the key by prefix, never the secret or its hash', r.status === 200 && r.json.data.keys.length === 1
    && r.json.data.keys[0].masked === `dwbk_${stored.prefix}_…` && !listed.includes(adminKey.secret) && !listed.includes(stored.key_sha256)
    && !('secret' in r.json.data.keys[0]), r.json);

  r = await call('GET', '/partner/api-keys', { token: t.staffA });
  check('a partner login that is not the owner cannot manage keys', r.status === 403 && /owner/.test(r.json.message), r.json);
  r = await call('GET', '/partner/api-keys', { token: t.ownerA });
  check('the owner login sees its partner\'s keys (without secrets)', r.status === 200 && r.json.data.keys.length === 1
    && !JSON.stringify(r.json).includes(adminKey.secret), r.json);
  r = await call('POST', '/partner/api-keys', { token: t.ownerA, body: { label: 'Back office PC' } });
  const ownerKey = r.json.data;
  check('the owner issues a second key itself', r.status === 201 && !!ownerKey?.secret, r.json);
  secrets.push(ownerKey.secret);
  r = await call('POST', `/partner/api-keys/${ownerKey.key.id}/revoke`, { token: t.ownerB, body: {} });
  check('another partner\'s owner cannot revoke it (not found)', r.status === 404, r.json);
  r = await call('GET', '/partner/api-keys', { token: t.ownerB });
  check('… nor see it', r.status === 200 && r.json.data.keys.length === 0, r.json);
  r = await call('POST', `/admin/partners/${V.A}/api-keys`, { token: t.pharmacistA, body: { label: 'x x' } });
  check('a pharmacist cannot issue keys', r.status === 403, r.status);

  console.log('\nUsing a key');
  r = await feed('GET', `/${V.A}/whoami`, { key: adminKey.secret });
  check('the key works for its own partner (whoami)', r.status === 200 && r.json.data?.partner_name === 'S36 Partner A'
    && r.json.data.key === `dwbk_${stored.prefix}_…` && !JSON.stringify(r.json).includes(adminKey.secret), r.json);
  r = await feed('GET', `/${V.A}/whoami`);
  check('no key → 401', r.status === 401, r.json);
  r = await feed('GET', `/${V.A}/whoami`, { key: 'not-a-key' });
  check('a malformed key → 401', r.status === 401, r.json);
  const wrongSecret = adminKey.secret.slice(0, -2) + (adminKey.secret.endsWith('AA') ? 'BB' : 'AA');
  r = await feed('GET', `/${V.A}/whoami`, { key: wrongSecret });
  check('the right prefix with a wrong secret → 401', r.status === 401 && /not valid/.test(r.json.message), r.json);
  r = await fetch(`${API}/partner-feed/${V.A}/whoami?key=${encodeURIComponent(adminKey.secret)}`).then(async (x) => ({ status: x.status }));
  check('a key in the URL is never accepted', r.status === 401, r);
  r = await feed('GET', `/${V.B}/whoami`, { key: adminKey.secret });
  check('Partner A\'s key on Partner B → 403 (wrong partner)', r.status === 403 && /another partner/.test(r.json.message), r.json);
  const xlsx = await buildMediVisionWorkbook(FILE, { company: 'S36 PARTNER A (TEST)' });
  r = await feed('POST', `/${V.B}/stock-files`, { key: adminKey.secret, file: { buffer: xlsx, name: 'stock.xlsx' } });
  check('… and it cannot upload Partner B\'s stock', r.status === 403, r.json);
  const refused = await q(`SELECT new_value FROM audit_logs WHERE action = 'partner_api_key_refused' AND new_value->>'key_id' = $1`, [adminKey.key.id]);
  check('refusals of a known key are audited by prefix (wrong partner)', refused.some((a) => a.new_value.reason === 'wrong partner'
    && a.new_value.prefix === stored.prefix), refused);
  r = await call('GET', `/partner/stock-imports`, { token: adminKey.secret });
  check('the key is not a sign-in: the portal refuses it', r.status === 401, r.json);

  console.log('\nThe stock file through the same pipeline as the portal');
  r = await feed('POST', `/${V.A}/stock-files`, { key: adminKey.secret });
  check('no file → 422 in plain words', r.status === 422 && /file/.test(r.json.message), r.json);
  r = await feed('POST', `/${V.A}/stock-files`, { key: adminKey.secret, file: { buffer: xlsx, name: 'S36 stock.xlsx' } });
  const viaKey = r.json.data;
  check('the billing software uploads the MediVision export (201, draft for the partner to review)', r.status === 201
    && viaKey?.status === 'draft' && !!viaKey.import_id && /review and apply/.test(viaKey.next_step), r.json);
  const manual = await portalUpload(t.ownerA, xlsx, 'S36 stock.xlsx');
  check('the same file uploaded by hand in the portal…', manual.status === 201, manual.json);
  const [a, b] = await q(`SELECT id, source_software, mapping_source, row_count, summary, created_by, api_key_id FROM partner_stock_imports
                          WHERE id = ANY($1) ORDER BY (api_key_id IS NULL)`, [[viaKey.import_id, manual.json.data?.id]]);
  check('… gives the same software, columns, rows and check summary (one pipeline)', a.source_software === b.source_software
    && a.source_software === 'MediVision Platinum (Allied Softtech)' && a.row_count === b.row_count
    && canon(a.summary) === canon(b.summary) && canon(viaKey.summary) === canon(a.summary), [a.summary, b.summary, viaKey.summary]);
  check('the import records the key, not a person', a.api_key_id === adminKey.key.id && a.created_by === null && b.api_key_id === null, a);
  r = await call('GET', '/partner/stock-imports', { token: t.ownerA });
  check('the partner sees it in the portal, marked as sent by its software', r.json.data?.imports?.some((i) => i.id === viaKey.import_id
    && i.api_key_prefix === stored.prefix && i.status === 'draft'), r.json.data?.imports);
  const used = await q(`SELECT action, new_value, performed_by FROM audit_logs WHERE new_value->>'vendor_id' = $1
                         AND action IN ('partner_api_key_used', 'partner_stock_import_uploaded') ORDER BY created_at`, [V.A]);
  check('every use is audited (whoami, upload) with the key prefix and no person', used.filter((u) => u.action === 'partner_api_key_used').length >= 2
    && used.some((u) => u.action === 'partner_stock_import_uploaded' && u.new_value.via === 'api_key' && u.new_value.api_key_prefix === stored.prefix
      && u.performed_by === null), used.map((u) => u.action));
  const [{ use_count, last_used_at }] = await q('SELECT use_count, last_used_at FROM partner_api_keys WHERE id = $1', [adminKey.key.id]);
  check('the key shows when it was last used and how often', use_count >= 2 && !!last_used_at, { use_count, last_used_at });

  console.log('\nRate limit');
  const windowKey = `stockfeed:rl:${adminKey.key.id}:${new Date().toISOString().slice(0, 13)}`;
  await redis.set(windowKey, '20', 'EX', 3600);
  r = await feed('POST', `/${V.A}/stock-files`, { key: adminKey.secret, file: { buffer: xlsx, name: 'again.xlsx' } });
  check('over the hourly allowance → 429 in plain words', r.status === 429 && /an hour/.test(r.json.message), r.json);
  await redis.del(windowKey);

  console.log('\nRevoking');
  r = await call('POST', `/admin/partners/${V.A}/api-keys/${adminKey.key.id}/revoke`, { token: t.admin, body: { reason: 'PC replaced' } });
  check('admin revokes the key', r.status === 200 && r.json.data?.key?.active === false && !!r.json.data.key.revoked_at, r.json);
  r = await call('POST', `/admin/partners/${V.A}/api-keys/${adminKey.key.id}/revoke`, { token: t.admin, body: {} });
  check('revoking twice → 409', r.status === 409, r.json);
  r = await feed('POST', `/${V.A}/stock-files`, { key: adminKey.secret, file: { buffer: xlsx, name: 'late.xlsx' } });
  check('a revoked key is refused', r.status === 401 && /revoked/.test(r.json.message), r.json);
  r = await feed('GET', `/${V.A}/whoami`, { key: ownerKey.secret });
  check('the partner\'s other key still works', r.status === 200, r.json);
  r = await call('GET', `/admin/partners/${V.A}/api-keys`, { token: t.admin });
  check('after creation the secret is never returned again (lists, revoke)', !secrets.some((s) => JSON.stringify(r.json).includes(s)), r.json);
  r = await call('POST', `/partner/api-keys/${ownerKey.key.id}/revoke`, { token: t.ownerA, body: { reason: 'test over' } });
  check('the owner revokes its own key', r.status === 200, r.json);

  console.log('\nLimits and partner status');
  for (let i = 0; i < 5; i++) await call('POST', `/admin/partners/${V.B}/api-keys`, { token: t.admin, body: { label: `S36 key ${i + 1}` } });
  r = await call('POST', `/admin/partners/${V.B}/api-keys`, { token: t.admin, body: { label: 'one too many' } });
  check('at most 5 keys in use per partner', r.status === 409 && /5 keys/.test(r.json.message), r.json);
  r = await call('POST', `/admin/partners/${V.A}/api-keys`, { token: t.admin, body: { label: 'After suspension' } });
  const late = r.json.data.secret;
  secrets.push(late);
  await q('UPDATE vendors SET is_active = FALSE WHERE id = $1', [V.A]);
  r = await feed('GET', `/${V.A}/whoami`, { key: late });
  check('a suspended partner\'s key is refused', r.status === 403 && /not active/.test(r.json.message), r.json);
  await q('UPDATE vendors SET is_active = TRUE WHERE id = $1', [V.A]);

  const audit = JSON.stringify(await q(`SELECT old_value, new_value, notes FROM audit_logs WHERE new_value->>'vendor_id' = ANY($1::text[])`, [[V.A, V.B]]));
  check('no secret is ever written to the audit log', !secrets.some((s) => audit.includes(s)), null);
  const log = process.env.API_LOG || '/tmp/dawabag-api.log';
  if (fs.existsSync(log)) {
    const text = fs.readFileSync(log, 'utf8');
    check('no secret appears in the API log', !secrets.some((s) => text.includes(s)), log);
  }
}
