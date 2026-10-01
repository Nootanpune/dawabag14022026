// Sprint 22 — bulk pack-photo upload by SKU (C-19 review, C-46 audit, server object store only).
// Works in both set-ups: without an object store (the default smoke environment)
// the whole request answers 503 and no product changes; with the in-memory fake
// store (AWS_S3_BUCKET=dawabag-fake-bucket, S3_ENDPOINT=<fakes>) a mixed batch is
// checked file by file.
// Test data: mobiles 90000022xx, SKUs S22-, category 'S22 Smoke'.
import { API, call, check, login, q, signUp } from '../sprint5/lib.mjs';
import { objects } from '../fakes/s3.mjs';
import { storeConfigured } from '../sprint21/productPhotos.mjs';

const consent = { accept_privacy_notice: true, age_confirmed: true };
const person = (mobile, name) => ({ customer_type: 'customer', full_name: name, mobile, password: 'Passw0rd!', ...consent });
const people = { admin: person('9000002201', 'S22 Admin'), pharmacist: person('9000002203', 'S22 Pharmacist') };
const SKUS = ['S22-ALPHA', 'S22-BETA'];

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(60)]);

export async function cleanup() {
  const ids = (await q('SELECT id FROM users WHERE mobile = ANY($1)', [Object.values(people).map((p) => p.mobile)])).map((r) => r.id);
  const productIds = (await q(`SELECT id FROM products WHERE sku LIKE 'S22-%'`)).map((r) => r.id);
  await q(`DELETE FROM audit_logs WHERE new_value->>'product_id' = ANY($1::text[])`, [productIds]);
  await q(`DELETE FROM audit_logs WHERE action = 'product_images_bulk' AND performed_by = ANY($1)`, [ids]);
  await q('DELETE FROM products WHERE id = ANY($1)', [productIds]);
  await q('UPDATE audit_logs SET performed_by = NULL WHERE performed_by = ANY($1)', [ids]);
  for (const t of ['notifications', 'consent_records', 'audit_logs', 'user_profiles']) await q(`DELETE FROM ${t} WHERE user_id = ANY($1)`, [ids]);
  await q('DELETE FROM users WHERE id = ANY($1)', [ids]);
}

export async function setup() {
  const ids = {};
  for (const [k, p] of Object.entries(people)) ids[k] = (await signUp(p)).user_id;
  await q(`UPDATE users SET role = 'admin' WHERE id = $1`, [ids.admin]);
  await q(`UPDATE users SET role = 'pharmacist_rx', pharmacist_reg_no = 'MSPC-S22-1' WHERE id = $1`, [ids.pharmacist]);
  const t = {};
  for (const [k, p] of Object.entries(people)) t[k] = await login(p);
  const P = {};
  for (const sku of SKUS) {
    const r = await call('POST', '/products', { token: t.admin, body: { name: `${sku} Photo Tablet`, sku, category: 'S22 Smoke',
      drug_schedule: 'OTC', gst_rate: 12, hsn_code: '30049099', mrp_paise: 3000, offer_price_paise: 2700, max_qty_per_order: 10,
      net_quantity: '10 tablets', manufacturer_name: 'S22 Pharma', manufacturer_address: 'Plot 22, MIDC Ambad, Nashik 422010' } });
    check(`product ${sku} created`, r.status === 201, r.json);
    P[sku] = r.json.data?.id;
  }
  // Both start approved, so the test sees which ones go back to review
  await q(`UPDATE products SET content_status = 'approved' WHERE id = ANY($1)`, [Object.values(P)]);
  return { ids, t, P };
}

async function bulk(token, files) {
  const form = new FormData();
  for (const [name, buf, type] of files) form.append('images', new Blob([buf], { type }), name);
  const res = await fetch(`${API}/products/images/bulk`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

const status = async (id) => (await q('SELECT content_status, s3_image_key FROM products WHERE id = $1', [id]))[0];

export async function runBulkPhotos({ ids, t, P }) {
  const store = storeConfigured();
  console.log(`\nBulk pack photos by SKU (${store ? 'fake object store' : 'no object store: uploads answer 503'})`);
  const A = P['S22-ALPHA'], B = P['S22-BETA'];

  let r = await bulk(t.pharmacist, [['S22-ALPHA.png', PNG, 'image/png']]);
  check('a pharmacist cannot bulk-upload photos', r.status === 403, r.json);
  r = await bulk(t.admin, Array.from({ length: 51 }, (_, i) => [`S22-X${i}.png`, PNG, 'image/png']));
  check('more than 50 files in one request is refused', r.status === 400 && /at most 50/.test(r.json.message), r.json);

  // Mixed batch: valid (lower-case name), unknown SKU, non-image bytes named .jpg,
  // duplicate SKU, wrong extension, and a JPEG whose bytes do not match ".png"
  const batch = [
    ['s22-alpha.png', PNG, 'image/png'],
    ['S22-NOPE.jpg', JPEG, 'image/jpeg'],
    ['S22-BETA.jpg', Buffer.from('%PDF-1.7 not a photo'), 'image/jpeg'],
    ['S22-ALPHA.PNG', PNG, 'image/png'],
    ['S22-ALPHA.gif', PNG, 'image/gif'],
  ];
  r = await bulk(t.admin, batch);
  if (!store) {
    check('without an object store the whole request answers 503', r.status === 503 && /storage is not configured/i.test(r.json.message), r.json);
    const [a, b] = [await status(A), await status(B)];
    check('…and no product changes', a.s3_image_key === null && a.content_status === 'approved' && b.content_status === 'approved', { a, b });
    return;
  }

  check('a mixed batch answers 200', r.status === 200, r.json);
  const res = r.json.data?.results || [];
  const by = (file) => res.find((x) => x.file === file);
  check('one result per file, in order', res.length === batch.length && res.every((x, i) => x.file === batch[i][0]), res);
  check('the valid file is uploaded (SKU matched without regard to case)',
    by('s22-alpha.png')?.status === 'uploaded' && by('s22-alpha.png')?.product_id === A && by('s22-alpha.png')?.sku === 'S22-ALPHA', by('s22-alpha.png'));
  check('an unknown SKU is skipped with "no product with SKU"', by('S22-NOPE.jpg')?.status === 'skipped' && /no product with SKU S22-NOPE/i.test(by('S22-NOPE.jpg')?.message), by('S22-NOPE.jpg'));
  check('non-image bytes named .jpg fail (magic bytes)', by('S22-BETA.jpg')?.status === 'failed' && /JPEG, PNG and WebP/.test(by('S22-BETA.jpg')?.message), by('S22-BETA.jpg'));
  check('a second file for the same SKU is skipped', by('S22-ALPHA.PNG')?.status === 'skipped' && by('S22-ALPHA.PNG')?.product_id === A, by('S22-ALPHA.PNG'));
  check('a .gif name fails', by('S22-ALPHA.gif')?.status === 'failed' && by('S22-ALPHA.gif')?.sku === null, by('S22-ALPHA.gif'));
  check('the summary counts add up', JSON.stringify(r.json.data?.summary) === JSON.stringify({ total: 5, uploaded: 1, skipped: 2, failed: 2 }), r.json.data?.summary);

  const [a, b] = [await status(A), await status(B)];
  check('the uploaded product waits for pharmacist review (C-19)', a.content_status === 'pending_review' && new RegExp(`^products/${A}/[0-9a-f-]{36}\\.png$`).test(a.s3_image_key || ''), a);
  check('…its photo is in the object store, not on the API disk', objects.get(a.s3_image_key)?.body?.equals(PNG));
  check('the product whose file failed is unchanged', b.content_status === 'approved' && b.s3_image_key === null, b);
  const queue = (await call('GET', '/products/content-review/queue', { token: t.pharmacist })).json.data?.products || [];
  check('the uploaded product is in the pharmacist review queue', queue.some((p) => p.id === A) && !queue.some((p) => p.id === B));
  const audit = [
    ...await q(`SELECT action FROM audit_logs WHERE action = 'product_image_set' AND new_value->>'product_id' = ANY($1::text[])`, [[A, B]]),
    ...await q(`SELECT action FROM audit_logs WHERE action = 'product_images_bulk' AND performed_by = $1`, [ids.admin]),
  ];
  check('audit: one photo entry and one batch entry (C-46)', audit.filter((x) => x.action === 'product_image_set').length === 1 && audit.filter((x) => x.action === 'product_images_bulk').length === 1, audit);

  // JPEG bytes in a file named .png: the name is the declared type, and it must agree
  r = await bulk(t.admin, [['S22-BETA.png', JPEG, 'image/png']]);
  check('a JPEG named .png fails (type must match its name)', r.status === 200 && r.json.data?.results?.[0]?.status === 'failed', r.json);
  r = await bulk(t.admin, [['S22-BETA.jpeg', JPEG, 'image/jpeg']]);
  check('a JPEG named .jpeg is uploaded', r.status === 200 && r.json.data?.results?.[0]?.status === 'uploaded' && (await status(B)).content_status === 'pending_review', r.json);
}
