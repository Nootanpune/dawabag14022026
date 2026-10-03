// Sprint 36 — merging a duplicate category / HSN code into another (Admin → Catalogue
// lists): products (drafts too) move in one transaction, the source is switched off and
// points at the target, old spellings land in the target, audited (C-46). An HSN code
// that is on a sold line cannot be merged (invoices read it, C-30).
import { call, check, q } from '../sprint5/lib.mjs';
import { HSN, categoryId, product, soldLine, t } from './fixtures.mjs';

const listAll = async (path) => (await call('GET', `${path}?all=true`, { token: t.admin })).json.data ?? [];

export async function runCategoryMerge() {
  console.log('\nCategory merge');
  // Two entries for the same thing, as made with Alt+C on different days
  let r = await call('POST', '/catalogue-lists/categories', { token: t.pharmacistA, body: { name: 'S36 Pain relief' } });
  check('a pharmacist adds "S36 Pain relief" with Alt+C', r.status === 201, r.json);
  r = await call('POST', '/catalogue-lists/categories', { token: t.pharmacistB, body: { name: 'S36 Painkillers' } });
  check('… and someone else adds "S36 Painkillers"', r.status === 201, r.json);
  await call('POST', '/catalogue-lists/categories', { token: t.admin, body: { name: 'S36 Old shelf' } });
  const src = await categoryId('S36 Painkillers');
  const dst = await categoryId('S36 Pain relief');
  const off = await categoryId('S36 Old shelf');
  await call('PATCH', `/catalogue-lists/categories/${off}`, { token: t.admin, body: { is_active: false } });
  const live = await product('S36-CAT-LIVE', { category: 'S36 Painkillers' });
  const draft = await product('S36-CAT-DRAFT', { category: 's36  PAINKILLERS', state: 'draft' });
  const kept = await product('S36-CAT-KEPT', { category: 'S36 Pain relief' });

  r = await call('POST', `/catalogue-lists/categories/${src}/merge`, { token: t.pharmacistA, body: { into_id: dst } });
  check('a pharmacist cannot merge (admins only)', r.status === 403, r.status);
  r = await call('POST', `/catalogue-lists/categories/${src}/merge`, { token: t.admin, body: { into_id: src } });
  check('merging into itself is refused in plain words', r.status === 400 && /itself/.test(r.json.message), r.json);
  r = await call('POST', `/catalogue-lists/categories/${src}/merge`, { token: t.admin, body: { into_id: off } });
  check('merging into a switched-off category is refused', r.status === 409 && /switched off/.test(r.json.message), r.json);
  r = await call('POST', `/catalogue-lists/categories/${src}/merge`, { token: t.admin, body: { into_id: '00000000-0000-4000-8000-000000000000' } });
  check('merging into a category that does not exist → 404', r.status === 404, r.json);

  r = await call('POST', `/catalogue-lists/categories/${src}/merge`, { token: t.admin, body: { into_id: dst, reason: 'Same shelf, typed twice' } });
  check('admin merges "S36 Painkillers" into "S36 Pain relief": both its products moved (draft included)',
    r.status === 200 && r.json.data?.products_moved === 2 && r.json.data.target.name === 'S36 Pain relief', r.json);
  const cats = await q('SELECT id, category FROM products WHERE id = ANY($1)', [[live, draft, kept]]);
  check('every product now says "S36 Pain relief"', cats.every((c) => c.category === 'S36 Pain relief'), cats);
  const list = await listAll('/catalogue-lists/categories');
  const srcRow = list.find((c) => c.id === src);
  check('the source stays in the list switched off, saying where it went',
    srcRow?.is_active === false && srcRow.merged_into === dst && srcRow.merged_into_name === 'S36 Pain relief' && srcRow.product_count === 0, srcRow);
  check('the target counts all three products', list.find((c) => c.id === dst)?.product_count === 3, list.find((c) => c.id === dst));
  const audit = await q(`SELECT performed_by, old_value, new_value, notes FROM audit_logs WHERE action = 'product_category_merged' AND new_value->>'category_id' = $1`, [src]);
  check('audited with who, from, to, products moved and the reason (C-46)', audit.length === 1 && audit[0].new_value.products_moved === 2
    && audit[0].old_value.name === 'S36 Painkillers' && audit[0].notes === 'Same shelf, typed twice', audit);

  r = await call('POST', `/catalogue-lists/categories/${src}/merge`, { token: t.admin, body: { into_id: dst } });
  check('a merged category cannot be merged again', r.status === 409 && /already merged/.test(r.json.message), r.json);
  r = await call('PATCH', `/catalogue-lists/categories/${src}`, { token: t.admin, body: { is_active: true } });
  check('… nor switched back on or renamed', r.status === 409, r.json);
  r = await call('POST', '/catalogue-lists/categories', { token: t.pharmacistA, body: { name: 'S36 painkillers' } });
  check('adding the old name again chooses the target instead of a new duplicate',
    r.status === 200 && r.json.data?.category?.id === dst && /merged into/.test(r.json.data.note), r.json);
  const late = await product('S36-CAT-LATE', { category: 'S36 Painkillers' });
  const [lateRow] = await q('SELECT category FROM products WHERE id = $1', [late]);
  check('a file or seed that still names the old spelling lands in the target (database trigger)', lateRow.category === 'S36 Pain relief', lateRow);

  // Merging into an entry that itself was merged is refused; chains stay one hop
  await call('POST', '/catalogue-lists/categories', { token: t.admin, body: { name: 'S36 Analgesics' } });
  const third = await categoryId('S36 Analgesics');
  r = await call('POST', `/catalogue-lists/categories/${third}/merge`, { token: t.admin, body: { into_id: src } });
  check('merging into a merged entry is refused (merge into its target instead)', r.status === 409 && /merged into another/.test(r.json.message), r.json);
  r = await call('POST', `/catalogue-lists/categories/${dst}/merge`, { token: t.admin, body: { into_id: third } });
  check('merging the target onward re-points earlier merges (one hop)', r.status === 200 && r.json.data?.entries_repointed === 1, r.json);
  const [chain] = await q('SELECT merged_into FROM product_categories WHERE id = $1', [src]);
  check('… so "S36 Painkillers" now points straight at "S36 Analgesics"', chain.merged_into === third, chain);
}

export async function runHsnMerge() {
  console.log('\nHSN code merge');
  for (const [code, gst] of [[HSN.a, 12], [HSN.b, 12], [HSN.c, 5], [HSN.sold, 12]]) {
    await call('POST', '/catalogue-lists/hsn-codes', { token: t.admin, body: { code, description: `S36 test code ${code}`, gst_rate: gst } });
  }
  const typo = await product('S36-HSN-TYPO', { category: 'S36 Smoke', hsn: HSN.a });
  const typoDraft = await product('S36-HSN-DRAFT', { category: 'S36 Smoke', hsn: HSN.a, state: 'draft' });
  const sold = await product('S36-HSN-SOLD', { category: 'S36 Smoke', hsn: HSN.sold });
  await soldLine(sold);

  let r = await call('POST', `/catalogue-lists/hsn-codes/${HSN.a}/merge`, { token: t.admin, body: { into_code: HSN.b } });
  check('an HSN merge needs a reason', r.status === 400 || r.status === 422, r.json);
  r = await call('POST', `/catalogue-lists/hsn-codes/${HSN.a}/merge`, { token: t.admin, body: { into_code: HSN.a, reason: 'typed twice' } });
  check('merging a code into itself is refused', r.status === 400, r.json);
  r = await call('POST', `/catalogue-lists/hsn-codes/${HSN.a}/merge`, { token: t.admin, body: { into_code: HSN.c, reason: 'typed twice' } });
  check('codes with different usual GST rates are not duplicates', r.status === 409 && /different tax classes/.test(r.json.message), r.json);
  r = await call('POST', `/catalogue-lists/hsn-codes/${HSN.sold}/merge`, { token: t.admin, body: { into_code: HSN.b, reason: 'typed twice' } });
  check('a code on a sold line cannot be merged (invoices read it, C-30)', r.status === 409 && /sold order line/.test(r.json.message), r.json);
  r = await call('POST', `/catalogue-lists/hsn-codes/${HSN.a}/merge`, { token: t.pharmacistA, body: { into_code: HSN.b, reason: 'typed twice' } });
  check('a pharmacist cannot merge HSN codes', r.status === 403, r.status);
  r = await call('POST', `/catalogue-lists/hsn-codes/${HSN.a}/merge`, { token: t.admin, body: { into_code: HSN.b, reason: 'Typed the wrong code on Alt+C' } });
  check('an unsold code is merged: its products move', r.status === 200 && r.json.data?.products_moved === 2, r.json);
  const rows = await q('SELECT hsn_code FROM products WHERE id = ANY($1)', [[typo, typoDraft]]);
  check('… both now carry the target code', rows.every((x) => x.hsn_code === HSN.b), rows);
  const [srcRow] = await q('SELECT is_active, merged_into FROM hsn_codes WHERE code = $1', [HSN.a]);
  check('the source code is switched off and points at the target', srcRow.is_active === false && srcRow.merged_into === HSN.b, srcRow);
  const late = await product('S36-HSN-LATE', { category: 'S36 Smoke', hsn: HSN.a });
  const [lateRow] = await q('SELECT hsn_code FROM products WHERE id = $1', [late]);
  check('a product given the old code gets the target code', lateRow.hsn_code === HSN.b, lateRow);
  const audit = await q(`SELECT notes, new_value FROM audit_logs WHERE action = 'hsn_code_merged' AND old_value->>'code' = $1`, [HSN.a]);
  check('HSN merge audited with the reason (C-46)', audit.length === 1 && audit[0].notes === 'Typed the wrong code on Alt+C' && audit[0].new_value.products_moved === 2, audit);
  r = await call('PATCH', `/catalogue-lists/hsn-codes/${HSN.a}`, { token: t.admin, body: { description: 'changed' } });
  check('a merged code cannot be edited', r.status === 409, r.json);
}
