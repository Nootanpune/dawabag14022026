// Sprint 32 D — Admin → Catalogue lists: rename (category: products follow, in one
// transaction, audited C-46), correct an unused HSN code, keep a used code's number,
// switch entries off / on (gone from pick-lists, kept on products); pharmacists read-only.
import { call, check, q } from '../sprint5/lib.mjs';

const invalid = (r) => r.status === 400 || r.status === 422;
const audited = async (action, where = '') => (await q(`SELECT 1 FROM audit_logs WHERE action = $1 ${where} LIMIT 1`, [action])).length === 1;

export async function lists({ t, P }) {
  console.log('\nD. Categories');
  let r = await call('POST', '/catalogue-lists/categories', { token: t.admin, body: { name: 'S32 Cough care' } });
  const cat = r.json.data?.category;
  check('category added', r.status === 201 && cat?.name === 'S32 Cough care', r.json);
  r = await call('PATCH', `/products/${P.ret}`, { token: t.admin, body: { category: 'S32 Cough care' } });
  check('a product uses it', r.status === 200, r.json);

  r = await call('PATCH', `/catalogue-lists/categories/${cat.id}`, { token: t.pharmacist, body: { name: 'S32 Cough and cold' } });
  check('pharmacist cannot rename (read-only)', r.status === 403, r.json);
  r = await call('GET', '/catalogue-lists/categories?all=true', { token: t.pharmacist });
  check('pharmacist can read the whole list', r.status === 200 && r.json.data.some((c) => c.id === cat.id), r.json);
  r = await call('PATCH', `/catalogue-lists/categories/${cat.id}`, { token: t.admin, body: { name: 's32  SMOKE' } });
  check('rename onto another entry refused (no merging)', r.status === 409 && /already in the list/.test(r.json.message), r.json);
  r = await call('PATCH', `/catalogue-lists/categories/${cat.id}`, { token: t.admin, body: { name: '!' } });
  check('bad name refused in plain words', invalid(r), r.json);
  r = await call('PATCH', `/catalogue-lists/categories/${cat.id}`, { token: t.admin, body: { name: ' S32  Cough and cold ' } });
  check('rename: tidied name, 1 product updated', r.status === 200 && r.json.data?.category?.name === 'S32 Cough and cold'
    && r.json.data?.products_updated === 1 && r.json.data?.category?.product_count === 1, r.json);
  check('… the product now shows the new name', (await q('SELECT category FROM products WHERE id = $1', [P.ret]))[0].category === 'S32 Cough and cold');
  check('… audited with old and new name and count', await audited('product_category_renamed',
    `AND old_value->>'name' = 'S32 Cough care' AND new_value->>'name' = 'S32 Cough and cold' AND new_value->>'products_updated' = '1'`));
  r = await call('GET', `/products/search?category=${encodeURIComponent('S32 Cough and cold')}&limit=10`);
  check('… the shop filters by the new name', (r.json.data?.products ?? []).some((p) => p.id === P.ret), r.json.data?.products);

  r = await call('PATCH', `/catalogue-lists/categories/${cat.id}`, { token: t.admin, body: { is_active: false } });
  check('switched off', r.status === 200 && r.json.data?.category?.is_active === false, r.json);
  check('… audited', await audited('product_category_deactivated', `AND new_value->>'category_id' = '${cat.id}'`));
  r = await call('GET', '/catalogue-lists/categories', { token: t.admin });
  check('… gone from the pick-list', r.status === 200 && !r.json.data.some((c) => c.id === cat.id));
  r = await call('GET', '/catalogue-lists/categories?q=cough', { token: t.admin });
  check('… found by search on the management page, marked inactive', r.json.data?.some((c) => c.id === cat.id && c.is_active === false), r.json);
  check('… the product keeps it', (await q('SELECT category FROM products WHERE id = $1', [P.ret]))[0].category === 'S32 Cough and cold');
  r = await call('PATCH', `/products/${P.ret}`, { token: t.admin, body: { category: 'S32 Cough and cold', max_qty_per_order: 90 } });
  check('… saving that product with its category is fine', r.status === 200, r.json);
  r = await call('PATCH', `/products/${P.trd}`, { token: t.admin, body: { category: 'S32 Cough and cold' } });
  check('… but it cannot be chosen for another product', r.status === 400 && /no longer used/.test(r.json.message), r.json);
  r = await call('POST', '/catalogue-lists/categories', { token: t.pharmacist, body: { name: 'S32 cough AND cold' } });
  check('… a pharmacist\'s "+ New" cannot switch it back on', r.status === 409 && /switched off by an admin/.test(r.json.message), r.json);
  r = await call('PATCH', `/catalogue-lists/categories/${cat.id}`, { token: t.admin, body: { is_active: true } });
  check('switched on again (audited)', r.status === 200 && r.json.data?.category?.is_active === true
    && await audited('product_category_reactivated', `AND new_value->>'category_id' = '${cat.id}'`), r.json);

  console.log('\nD. HSN codes');
  r = await call('POST', '/catalogue-lists/hsn-codes', { token: t.admin, body: { code: '99323200', description: 'S32 test goods', gst_rate: 12 } });
  check('unused HSN added', r.status === 201, r.json);
  r = await call('PATCH', '/catalogue-lists/hsn-codes/99323200', { token: t.pharmacist, body: { description: 'S32 changed' } });
  check('pharmacist cannot edit (read-only)', r.status === 403, r.json);
  r = await call('PATCH', '/catalogue-lists/hsn-codes/99323200', { token: t.admin, body: { code: '9932 32 01' } });
  check('an unused code can be corrected', r.status === 200 && r.json.data?.hsn?.code === '99323201', r.json);
  check('… audited old → new', await audited('hsn_code_changed', `AND old_value->>'code' = '99323200' AND new_value->>'code' = '99323201'`));
  r = await call('POST', '/catalogue-lists/hsn-codes', { token: t.admin, body: { code: '99323210', description: 'S32 used goods', gst_rate: 12 } });
  r = await call('PATCH', `/products/${P.all}`, { token: t.admin, body: { hsn_code: '99323210' } });
  check('a product uses HSN 99323210', r.status === 200, r.json);
  r = await call('PATCH', '/catalogue-lists/hsn-codes/99323210', { token: t.admin, body: { code: '99323211' } });
  check('a used code keeps its number (409, plain reason)', r.status === 409 && /used by 1 product, so the code cannot be changed/.test(r.json.message), r.json);
  r = await call('PATCH', '/catalogue-lists/hsn-codes/99323201', { token: t.admin, body: { code: '99323210' } });
  check('correcting onto a listed code refused', r.status === 409 && /already in the list/.test(r.json.message), r.json);
  r = await call('PATCH', '/catalogue-lists/hsn-codes/99323210', { token: t.admin, body: { description: 'S32 used goods, other', gst_rate: 18 } });
  check('… its description and usual GST can change', r.status === 200 && r.json.data?.hsn?.description === 'S32 used goods, other' && r.json.data?.hsn?.gst_rate === 18, r.json);
  check('… no product GST changed', Number((await q('SELECT gst_rate FROM products WHERE id = $1', [P.all]))[0].gst_rate) === 12);
  r = await call('PATCH', '/catalogue-lists/hsn-codes/99323210', { token: t.admin, body: { gst_rate: 7 } });
  check('bad GST slab refused', invalid(r), r.json);
  r = await call('PATCH', '/catalogue-lists/hsn-codes/99323210', { token: t.admin, body: { is_active: false } });
  check('HSN switched off (audited)', r.status === 200 && r.json.data?.hsn?.is_active === false
    && await audited('hsn_code_deactivated', `AND new_value->>'code' = '99323210'`), r.json);
  r = await call('GET', '/catalogue-lists/hsn-codes', { token: t.admin });
  check('… gone from the pick-list', !r.json.data.some((h) => h.code === '99323210'));
  r = await call('GET', '/catalogue-lists/hsn-codes?q=99323', { token: t.pharmacist });
  check('… listed by search with its product count', r.json.data?.some((h) => h.code === '99323210' && h.is_active === false && h.product_count === 1), r.json);
  check('… the product keeps it', (await q('SELECT hsn_code FROM products WHERE id = $1', [P.all]))[0].hsn_code === '99323210');
  r = await call('PATCH', `/products/${P.mix}`, { token: t.admin, body: { hsn_code: '99323210' } });
  check('… but it cannot be chosen for another product', r.status === 400 && /no longer used/.test(r.json.message), r.json);
  r = await call('PATCH', '/catalogue-lists/hsn-codes/99323210', { token: t.admin, body: { is_active: true } });
  check('HSN switched on again', r.status === 200 && r.json.data?.hsn?.is_active === true, r.json);
  r = await call('PATCH', '/catalogue-lists/hsn-codes/99323210', { token: t.admin, body: {} });
  check('an empty change is refused', invalid(r), r.json);
}
