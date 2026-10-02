// Sprint 34 A — fixes from the security review of Sprints 25–33 (docs/security/review-sprint25-33.md)
import zlib from 'zlib';
import { API, call, check, q } from '../sprint5/lib.mjs';
import { addr, ids, P, people, PIN, t, V } from './fixtures.mjs';

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000100e221bc330000000049454e44ae426082', 'hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function upload(path, token, field, buf, type, name) {
  const form = new FormData();
  form.append(field, new Blob([buf], { type }), name);
  const started = Date.now();
  const res = await fetch(`${API}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  return { status: res.status, json: await res.json().catch(() => ({})), ms: Date.now() - started };
}

/** A small ZIP whose one part unpacks to `bytes` of zeros — an "xlsx" zip bomb. */
function zipBomb(bytes) {
  const data = zlib.deflateRawSync(Buffer.alloc(bytes));
  const name = Buffer.from('xl/worksheets/sheet1.xml');
  const loc = Buffer.alloc(30);
  loc.writeUInt32LE(0x04034b50, 0); loc.writeUInt16LE(20, 4); loc.writeUInt16LE(8, 8);
  loc.writeUInt32LE(data.length, 18); loc.writeUInt32LE(bytes, 22); loc.writeUInt16LE(name.length, 26);
  const cen = Buffer.alloc(46);
  cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(8, 10);
  cen.writeUInt32LE(data.length, 20); cen.writeUInt32LE(bytes, 24); cen.writeUInt16LE(name.length, 28);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
  end.writeUInt32LE(46 + name.length, 12); end.writeUInt32LE(30 + name.length + data.length, 16);
  return Buffer.concat([loc, name, data, cen, name, end]);
}

export async function runReview() {
  console.log('\nHigh: licence scans are reachable only by their holder (IDOR)');
  const lic = async (col, owner, n) => (await q(
    `INSERT INTO party_licences (${col}, form, licence_number, valid_upto, status, document_key, document_mime)
     VALUES ($1, 'dl21', $2, CURRENT_DATE + 300, 'pending', $3, 'image/png') RETURNING id`,
    [owner, `S34-DOC-${n}`, `licences/test/${n}.png`]))[0].id;
  const licA = await lic('user_id', ids.retailerA, 'A');
  const licB = await lic('user_id', ids.retailerB, 'B');
  const licPB = await lic('vendor_id', V.f21, 'PB');
  let r = await call('GET', `/users/me/licences/${licB}/document-url`, { token: t.retailerA });
  check('buyer A cannot open buyer B\'s licence scan', r.status === 404 && r.json.message === 'Licence not found', r.json);
  r = await upload(`/users/me/licences/${licB}/document`, t.retailerA, 'file', PNG, 'image/png', 'b.png');
  check('… nor replace it', r.status === 404 && r.json.message === 'Licence not found', r.json);
  r = await call('GET', `/users/me/licences/${licA}/document-url`, { token: t.retailerA });
  check('buyer A still reaches their own scan (link, or "storage not configured" on this server)', [200, 503].includes(r.status), r.json);
  r = await call('GET', `/partner/licences/${licPB}/document-url`, { token: t.partnerA });
  check('partner A cannot open partner B\'s licence scan', r.status === 404 && r.json.message === 'Licence not found', r.json);
  r = await upload(`/partner/licences/${licPB}/document`, t.partnerA, 'file', PNG, 'image/png', 'b.png');
  check('… nor replace it', r.status === 404, r.json);
  r = await call('GET', `/partner/licences/${licA}/document-url`, { token: t.partnerA });
  check('a partner cannot open a buyer\'s licence scan', r.status === 404, r.json);

  r = await call('GET', '/admin/party-licences?filter=waiting&party=customer', { token: t.admin });
  const custIds = (r.json.data?.licences ?? []).map((l) => l.id);
  check('licence work list, party=customer (now a bound parameter): buyers only', r.status === 200 && custIds.includes(licA) && !custIds.includes(licPB), r.status);
  r = await call('GET', '/admin/party-licences?filter=waiting&party=vendor', { token: t.admin });
  const vendIds = (r.json.data?.licences ?? []).map((l) => l.id);
  check('… party=vendor: partners and suppliers only', r.status === 200 && vendIds.includes(licPB) && !vendIds.includes(licA), r.status);
  r = await call('GET', `/admin/party-licences?filter=all&party=${encodeURIComponent("vendor' OR '1'='1")}`, { token: t.admin });
  check('… anything else refused', r.status === 422, r.status);

  console.log('\nMedium: uploads are typed by their bytes, not the name the browser gave');
  const html = Buffer.from('<html><body><script>alert(document.cookie)</script></body></html>');
  r = await upload(`/users/me/licences/${licA}/document`, t.retailerA, 'file', html, 'image/png', 'scan.png');
  check('an HTML page sent as a PNG licence scan is refused', r.status === 400 && /Only PDF, JPG and PNG/.test(r.json.message), r.json);
  r = await upload(`/users/me/licences/${licA}/document`, t.retailerA, 'file', Buffer.from('%PDF-1.4\n%test\n'), 'image/png', 'scan.png');
  check('a PDF declared as a PNG is refused', r.status === 400 && /does not match/.test(r.json.message), r.json);
  r = await upload('/prescriptions/upload', t.buyer, 'prescription', html, 'image/jpeg', 'rx.jpg');
  check('an HTML page sent as a prescription photo is refused', r.status === 400 && /Only PDF, JPG and PNG/.test(r.json.message), r.json);

  console.log('\nMedium: changing the password ends every other session (C-44)');
  const signIn = async () => (await call('POST', '/auth/login', { body: { mobile: people.changer.mobile, password: people.changer.password } })).json.data;
  const phone = await signIn();
  const laptop = await signIn();
  await sleep(1100);   // tokens carry whole seconds; the change happens in a later second
  r = await call('POST', '/auth/change-password', { token: laptop.access_token,
    body: { current_password: people.changer.password, new_password: 'NewPassw0rd34', refresh_token: laptop.refresh_token } });
  check('password changed on the laptop, which gets a new session', r.status === 200 && !!r.json.data?.access_token, r.json);
  const fresh = r.json.data;
  r = await call('GET', '/users/me', { token: phone.access_token });
  check('the phone\'s access token stops working at once', r.status === 401 && /password was changed/.test(r.json.message), r.json);
  r = await call('POST', '/auth/refresh', { body: { refresh_token: phone.refresh_token } });
  check('… and its refresh token cannot be renewed', r.status === 401, r.json);
  r = await call('GET', '/users/me', { token: fresh.access_token });
  check('the new session works', r.status === 200, r.json);
  r = await call('POST', '/auth/refresh', { body: { refresh_token: fresh.refresh_token } });
  check('… and renews', r.status === 200 && !!r.json.data?.access_token, r.json);
  r = await call('POST', '/auth/login', { body: { mobile: people.changer.mobile, password: 'NewPassw0rd34' } });
  check('signing in again with the new password works', r.status === 200, r.json);
  r = await call('POST', '/auth/login', { body: { mobile: '9000003499', password: 'Whatever1' } });
  check('an unknown mobile gets the same answer as a wrong password', r.status === 401 && r.json.message === 'Invalid credentials', r.json);

  console.log('\nMedium: pharmacists see health details only for orders being worked on (C-41)');
  await call('PUT', '/health-profile', { token: t.buyer, body: { consent: true, allergies: ['S34 allergy'], conditions: [], current_medicines: [] } });
  r = await call('POST', '/orders', { token: t.buyer, body: { address_id: addr.buyer, pincode: PIN, items: [{ product_id: P.ownStd, quantity: 1 }] } });
  const orderId = r.json.data?.order?.id;
  check('an order to look at', r.status === 201 && !!orderId, r.json);
  r = await call('GET', `/health-profile/orders/${orderId}`, { token: t.pharmacist });
  check('open order: the pharmacist sees the allergy', r.status === 200 && r.json.data?.allergies?.includes('S34 allergy'), r.json);
  await q(`UPDATE orders SET status = 'cancelled' WHERE id = $1`, [orderId]);
  r = await call('GET', `/health-profile/orders/${orderId}`, { token: t.pharmacist });
  check('closed order: refused in plain words', r.status === 409 && /only while an order is being checked or packed/.test(r.json.message), r.json);

  console.log('\nLow: odd search parameters are a normal answer, not a server error');
  r = await call('GET', '/products/search?q=S34&limit=abc&page=-3');
  check('limit=abc, page=-3 → 200 with defaults', r.status === 200 && r.json.data?.pagination?.limit === 20 && r.json.data.pagination.page === 1, r.json);
  r = await call('GET', '/products/search?q=a&q=b');
  check('a repeated ?q= → 200', r.status === 200, r.status);
  r = await call('GET', '/products/search/suggest?q=a&q=b');
  check('suggest with a repeated ?q= → 200', r.status === 200, r.status);

  console.log('\nMedium: spreadsheets cannot tie up the API');
  const bomb = zipBomb(80 * 1024 * 1024);
  r = await upload('/partner/stock-imports', t.partnerA, 'file', bomb, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'stock.xlsx');
  check(`an ${Math.round(bomb.length / 1024)} KB .xlsx that unpacks to 80 MB is refused quickly`, r.status === 422 && /could not be read safely/.test(r.json.message) && r.ms < 5000, { ...r.json, ms: r.ms });
  r = await upload('/catalogue/import/preview', t.admin, 'file', bomb, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'catalogue.xlsx');
  check('… also in the admin catalogue import', r.status === 422 && /could not be read safely/.test(r.json.message), r.json);
  const tags = Buffer.from(`<table>${'<tr><td'.repeat(300_000)}`);
  r = await upload('/partner/stock-imports', t.partnerA, 'file', tags, 'application/vnd.ms-excel', 'stock.xls');
  check(`a ${(tags.length / 1048576).toFixed(1)} MB HTML ".xls" full of unclosed tags is answered in seconds`, r.status === 422 && r.ms < 5000, { ...r.json, ms: r.ms });
  r = await upload('/partner/stock-imports', t.partnerA, 'file', Buffer.from('Item Name,Batch,Expiry,MRP,Qty\n' + 'x,1,06/28,9,1\n'.repeat(11_000)), 'text/csv', 'stock.csv');
  check('a CSV over the row limit is refused with the limit named', r.status === 422 && /more than 10000 rows/.test(r.json.message), r.json);
  r = await call('GET', '/health', { absolute: true });
  check('the API is still up', r.status === 200);

  console.log('\nLow: partner stock import steps are in the audit trail (C-46)');
  const csv = 'Item Name,Batch No,Expiry,MRP,Qty\nS34 Standardzor 500 Tablet,B1,06/2028,100,5\n';
  r = await upload('/partner/stock-imports', t.partnerA, 'file', Buffer.from(csv), 'text/csv', 'stock.csv');
  const importId = r.json.data?.id;
  check('a small stock file is read', r.status === 201 && !!importId, r.json);
  r = await call('POST', `/partner/stock-imports/${importId}/cancel`, { token: t.partnerA });
  const cancelled = await q(`SELECT 1 FROM audit_logs WHERE action = 'partner_stock_import_cancelled' AND new_value->>'import_id' = $1`, [importId]);
  check('cancelling an import is audited', r.status === 200 && cancelled.length === 1, r.json);
}

/** Low: uploads have their own, tighter rate limit (a second API on port 4134 with a limit of 2). */
export async function runUploadLimit() {
  console.log('\nLow: uploads have their own rate limit');
  const { startApi } = await import('../sprint26/trialApi.mjs');
  const api = await startApi(4134, { UPLOAD_RATE_LIMIT_MAX: '2' });
  check('a second API started with an upload limit of 2', !!api.base, api.log?.slice?.(-500));
  if (!api.base) return;
  try {
    const statuses = [];
    for (let i = 0; i < 3; i++) {
      const form = new FormData();
      form.append('prescription', new Blob([Buffer.from('not a picture')], { type: 'image/png' }), 'rx.png');
      const res = await fetch(`${api.base}/prescriptions/upload`, { method: 'POST', headers: { Authorization: `Bearer ${t.buyer}` }, body: form });
      statuses.push(res.status);
    }
    check('the third upload within 15 minutes is refused (429)', statuses[0] === 400 && statuses[1] === 400 && statuses[2] === 429, statuses);
    const r = await fetch(`${api.base}/products/search?q=S34`);
    check('… other requests are not affected', r.status === 200, r.status);
  } finally { await api.stop(); }
}
