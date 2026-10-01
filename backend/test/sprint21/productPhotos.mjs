// Sprint 21 — product pack photos (C-19 review, C-46 audit, server object store only).
// Works in both set-ups: without an object store (the default smoke environment)
// an upload answers 503 and every image_url is null; with the in-memory fake store
// (AWS_S3_BUCKET=dawabag-fake-bucket, S3_ENDPOINT=<fakes>) the photo is stored,
// reviewed and served through a short-lived signed link.
// Test data: mobiles 90000021xx, SKU S21-, category 'S21 Smoke'.
import { API, call, check, login, q, signUp } from '../sprint5/lib.mjs';
import { FAKE_S3_BUCKET, objects } from '../fakes/s3.mjs';

const consent = { accept_privacy_notice: true, age_confirmed: true };
const person = (mobile, name) => ({ customer_type: 'customer', full_name: name, mobile, password: 'Passw0rd!', ...consent });
const people = { admin: person('9000002101', 'S21 Admin'), buyer: person('9000002102', 'S21 Buyer'), pharmacist: person('9000002103', 'S21 Pharmacist') };
const CATEGORY = 'S21 Smoke';

// Smallest valid PNG (1×1)
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

export const storeConfigured = () => process.env.AWS_S3_BUCKET === FAKE_S3_BUCKET && !!process.env.S3_ENDPOINT;

export async function cleanup() {
  const ids = (await q('SELECT id FROM users WHERE mobile = ANY($1)', [Object.values(people).map((p) => p.mobile)])).map((r) => r.id);
  const productIds = (await q(`SELECT id FROM products WHERE sku LIKE 'S21-%'`)).map((r) => r.id);
  await q('DELETE FROM cart_items WHERE user_id = ANY($1) OR product_id = ANY($2)', [ids, productIds]);
  await q('DELETE FROM carts WHERE user_id = ANY($1)', [ids]);
  await q(`DELETE FROM audit_logs WHERE new_value->>'product_id' = ANY($1::text[])`, [productIds]);
  await q('DELETE FROM inventory_batches WHERE product_id = ANY($1)', [productIds]);
  await q('DELETE FROM products WHERE id = ANY($1)', [productIds]);
  await q('UPDATE audit_logs SET performed_by = NULL WHERE performed_by = ANY($1)', [ids]);
  for (const t of ['notifications', 'consent_records', 'audit_logs', 'user_profiles']) await q(`DELETE FROM ${t} WHERE user_id = ANY($1)`, [ids]);
  await q('DELETE FROM users WHERE id = ANY($1)', [ids]);
}

export async function setup() {
  const ids = {};
  for (const [k, p] of Object.entries(people)) ids[k] = (await signUp(p)).user_id;
  await q(`UPDATE users SET role = 'admin' WHERE id = $1`, [ids.admin]);
  await q(`UPDATE users SET role = 'pharmacist_rx', pharmacist_reg_no = 'MSPC-S21-1' WHERE id = $1`, [ids.pharmacist]);
  const t = {};
  for (const [k, p] of Object.entries(people)) t[k] = await login(p);
  const r = await call('POST', '/products', { token: t.admin, body: { name: 'S21 Photo Paracetamol 650', sku: 'S21-PHOTO', category: CATEGORY,
    drug_schedule: 'OTC', gst_rate: 12, hsn_code: '30049099', mrp_paise: 3000, offer_price_paise: 2700, max_qty_per_order: 10,
    net_quantity: '15 tablets', manufacturer_name: 'S21 Pharma', manufacturer_address: 'Plot 21, MIDC Ambad, Nashik 422010' } });
  check('product created', r.status === 201, r.json);
  const P = r.json.data?.id;
  await q(`INSERT INTO inventory_batches (product_id, batch_number, quantity_available, purchase_price_paise, expiry_date) VALUES ($1, 'S21-B1', 50, 1500, CURRENT_DATE + 400)`, [P]);
  return { ids, t, P };
}

async function upload(productId, token, buf, type, name = 'pack.png') {
  const form = new FormData();
  form.append('image', new Blob([buf], { type }), name);
  const res = await fetch(`${API}/products/${productId}/image`, { method: 'PUT', headers: { Authorization: `Bearer ${token}` }, body: form });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

const detail = async (P, token) => (await call('GET', `/products/${P}`, { token })).json.data;
const searched = async (token) => (await call('GET', `/products/search?category=${encodeURIComponent(CATEGORY)}`, { token })).json.data?.products?.[0];

export async function runProductPhotos({ t, P }) {
  const store = storeConfigured();
  console.log(`\nProduct pack photos (${store ? 'fake object store' : 'no object store: uploads answer 503'})`);

  check('the API has no photo before one is uploaded', (await detail(P, t.buyer))?.image_url === null);
  let r = await upload(P, t.buyer, PNG, 'image/png');
  check('a customer cannot upload a product photo', r.status === 403, r.json);
  r = await upload(P, t.pharmacist, PNG, 'image/png');
  check('a pharmacist cannot upload a product photo', r.status === 403, r.json);
  r = await upload(P, t.admin, Buffer.from('%PDF-1.7 pretending to be a photo'), 'image/png');
  check('a file that is not really an image is refused (magic bytes)', r.status === 400 && /JPEG, PNG and WebP/.test(r.json.message), r.json);
  r = await upload(P, t.admin, Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]), 'image/png');
  check('a photo over 2 MB is refused', r.status === 413, r.json);
  r = await upload('00000000-0000-4000-8000-000000000000', t.admin, PNG, 'image/png');
  check('a photo for an unknown product is refused', r.status === 404, r.json);

  r = await upload(P, t.admin, PNG, 'image/png');
  if (!store) {
    check('without an object store the upload answers 503', r.status === 503 && /storage is not configured/i.test(r.json.message), r.json);
    const row = (await q('SELECT s3_image_key FROM products WHERE id = $1', [P]))[0];
    check('…and the product keeps no image key', row?.s3_image_key === null, row);
    check('admin view: image_url null', (await call('GET', `/products/${P}/admin`, { token: t.admin })).json.data?.image_url === null);
  } else {
    const key = r.json.data?.s3_image_key;
    check('an admin uploads a pack photo', r.status === 200 && new RegExp(`^products/${P}/[0-9a-f-]{36}\\.png$`).test(key || ''), r.json);
    check('…stored in the object store, not on the API disk', objects.get(key)?.body?.equals(PNG), [...objects.keys()].filter((k) => k.startsWith('products/')));
    check('…and sent to pharmacist review (C-19)', r.json.data?.content_status === 'pending_review', r.json.data);
    const audit = await q(`SELECT performed_by FROM audit_logs WHERE action = 'product_image_set' AND new_value->>'product_id' = $1`, [P]);
    check('…audit-logged with who did it (C-46)', audit.length === 1 && audit[0].performed_by, audit);
    const admin = (await call('GET', `/products/${P}/admin`, { token: t.admin })).json.data;
    check('staff see the photo while it waits for review', !!admin?.image_url, admin?.image_url);
  }

  // Not yet approved → customers see no photo
  let d = await detail(P, t.buyer);
  check('customers see no photo before pharmacist approval', d?.image_url === null && d?.content_reviewed === false, d);
  check('…nor in search', (await searched(t.buyer))?.image_url === null);
  const queue = (await call('GET', '/products/content-review/queue', { token: t.pharmacist })).json.data?.products || [];
  const queued = queue.find((p) => p.id === P);
  check('the product is in the pharmacist review queue', !!queued, queue.length);
  if (store) check('…with its photo to check against the product', !!queued?.image_url, queued);

  r = await call('POST', `/products/${P}/content-review`, { token: t.pharmacist, body: { approve: true, notes: 'Photo shows the 650 mg pack' } });
  check('the pharmacist approves copy and photo', r.status === 200, r.json);

  d = await detail(P, t.buyer);
  const s = await searched(t.buyer);
  r = await call('PUT', `/cart/items/${P}`, { token: t.buyer, body: { quantity: 1 } });
  const line = r.json.data?.items?.find((i) => i.product_id === P);
  if (!store) {
    check('without a store image_url stays null (detail, search, cart)', d?.image_url === null && s?.image_url === null && line?.image_url === null, { d: d?.image_url, s: s?.image_url, line });
  } else {
    check('after approval the product page has a photo link', /^http/.test(d?.image_url || ''), d?.image_url);
    check('…search has it too', s?.image_url === d?.image_url, s?.image_url);
    check('…and the cart line', line?.image_url === d?.image_url, line);
    check('the bucket stays private: a link is signed and short-lived', /X-Amz-Signature=/.test(d.image_url) && /X-Amz-Expires=3600/.test(d.image_url), d.image_url);
    const img = await fetch(d.image_url);
    const bytes = Buffer.from(await img.arrayBuffer());
    check('the link serves the photo with a cache header', img.status === 200 && img.headers.get('content-type') === 'image/png' && bytes.equals(PNG) && /max-age=3600/.test(img.headers.get('cache-control') || ''), { status: img.status, type: img.headers.get('content-type') });
  }

  // Replacing goes back to review; removing clears it
  if (store) {
    r = await upload(P, t.admin, PNG, 'image/png');
    check('a replacement photo goes back to review', r.status === 200 && (await detail(P, t.buyer))?.image_url === null, r.json);
  }
  r = await call('DELETE', `/products/${P}/image`, { token: t.buyer });
  check('a customer cannot remove a product photo', r.status === 403, r.json);
  r = await call('DELETE', `/products/${P}/image`, { token: t.admin });
  check('an admin removes the photo', r.status === 200 && r.json.data?.image_url === null, r.json);
  const row = (await q('SELECT s3_image_key FROM products WHERE id = $1', [P]))[0];
  check('…the product no longer points at a photo', row?.s3_image_key === null, row);
  if (store) {
    const removed = await q(`SELECT 1 FROM audit_logs WHERE action = 'product_image_removed' AND new_value->>'product_id' = $1`, [P]);
    check('…audit-logged (C-46)', removed.length === 1);
  }
}
