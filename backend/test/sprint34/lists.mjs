// Sprint 34 B + D — catalogue import reads "Schedule C/C1"; a switched-off category or HSN
// code is refused by the import (plain reason per row) and by the database trigger, unless
// the product already had it.
import { createRequire } from 'module';
import { API, call, check, q } from '../sprint5/lib.mjs';
import { P, t } from './fixtures.mjs';

const require = createRequire(import.meta.url);
const ExcelJS = require('exceljs');

const HEAD = ['Medicine Name', 'Generic', 'SKU', 'Category', 'Drug Schedule', 'Strength / Pack Size', 'Marketed By', 'MRP', 'Offer Price',
  'GST Rate', 'HSN', 'Manufacturer Address', 'Schedule C/C1'];
const row = (sku, name, category, hsn, schedC) =>
  [name, 'S34 Generic', sku, category, 'Schedule H', '1 vial', 'S34 Pharma', 100, 90, 12, hsn, 'Plot 34, MIDC Satpur, Nashik 422007', schedC];

async function workbook(rows) {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet('1_Medicine_Master').addRows([HEAD, ...rows]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
async function send(path, buf) {
  const form = new FormData();
  form.append('file', new Blob([buf]), 'catalogue.xlsx');
  const res = await fetch(`${API}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${t.admin}` }, body: form });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}
const sqlError = async (sql, params) => { try { await q(sql, params); return null; } catch (e) { return e; } };

export async function runLists() {
  console.log('\nD. Switched-off catalogue list entries');
  let r = await call('POST', '/catalogue-lists/categories', { token: t.admin, body: { name: 'S34 Old Tonics' } });
  check('category added', [200, 201].includes(r.status), r.json);
  r = await call('POST', '/catalogue-lists/hsn-codes', { token: t.admin, body: { code: '99343401', description: 'S34 test code', gst_rate: 12 } });
  check('HSN code added', [200, 201].includes(r.status), r.json);
  // A product that already uses both, before they are switched off
  await q(`UPDATE products SET category = 'S34 Old Tonics', hsn_code = '99343401' WHERE id = $1`, [P.ownStd]);
  const cat = (await q(`SELECT id FROM product_categories WHERE name_key = 's34 old tonics'`))[0].id;
  r = await call('PATCH', `/catalogue-lists/categories/${cat}`, { token: t.admin, body: { is_active: false } });
  check('category switched off', r.status === 200, r.json);
  r = await call('PATCH', '/catalogue-lists/hsn-codes/99343401', { token: t.admin, body: { is_active: false } });
  check('HSN code switched off', r.status === 200, r.json);

  let e = await sqlError(`INSERT INTO products (sku, name, category, mrp_paise, offer_price_paise) VALUES ('S34-TRIG1', 'S34 Trigger One', 'S34 old tonics', 100, 90)`);
  check('database: a NEW product cannot take the switched-off category', e?.constraint === 'products_category_switched_off', e?.message);
  e = await sqlError(`INSERT INTO products (sku, name, category, hsn_code, mrp_paise, offer_price_paise) VALUES ('S34-TRIG2', 'S34 Trigger Two', 'S34 Smoke', '99343401', 100, 90)`);
  check('… nor the switched-off HSN code', e?.constraint === 'products_hsn_switched_off', e?.message);
  e = await sqlError(`UPDATE products SET category = 'S34 Old Tonics' WHERE id = $1`, [P.std]);
  check('database: an existing product cannot MOVE to it', e?.constraint === 'products_category_switched_off', e?.message);
  e = await sqlError(`UPDATE products SET category = 'S34 Old Tonics', hsn_code = '99343401', name = 'S34 Ownzor 500 Tablet' WHERE id = $1`, [P.ownStd]);
  check('database: a product that already had them keeps them (saved again unchanged)', e === null, e?.message);
  r = await call('PATCH', `/products/${P.std}`, { token: t.admin, body: { hsn_code: '99343401' } });
  check('product form: refused in plain words', r.status >= 400 && r.status < 500 && /switched off|no longer used/i.test(r.json.message), r.json);
  r = await call('PATCH', `/catalogue-lists/categories/${cat}`, { token: t.admin, body: { name: 'S34 Old Tonic Syrups' } });
  const moved = await q(`SELECT category FROM products WHERE id = $1`, [P.ownStd]);
  check('renaming the switched-off category still moves its products to the new spelling', r.status === 200 && moved[0]?.category === 'S34 Old Tonic Syrups', [r.json, moved]);

  console.log('\nB + D. Catalogue import: "Schedule C/C1" column and switched-off entries');
  const buf = await workbook([
    row('S34-IMP1', 'S34 Importvaccine Injection', 'S34 Smoke', '3004', 'yes'),
    row('S34-IMP2', 'S34 Importzor Tablet', 'S34 Smoke', '3004', 'no'),
    row('S34-IMP3', 'S34 Importmaybe Tablet', 'S34 Smoke', '3004', 'perhaps'),
    row('S34-IMP4', 'S34 Importtonic Syrup', 'S34 Old Tonic Syrups', '3004', 'no'),
    row('S34-IMP5', 'S34 Importhsn Tablet', 'S34 Smoke', '99343401', ''),
  ]);
  r = await send('/catalogue/import/preview', buf);
  const rows = new Map((r.json.data?.products ?? []).map((p) => [p.sku, p]));
  check('preview: yes / no read into the record', rows.get('S34-IMP1')?.record?.schedule_c_c1 === true && rows.get('S34-IMP2')?.record?.schedule_c_c1 === false, r.json);
  check('preview: anything else is an error on its row', rows.get('S34-IMP3')?.errors?.some((x) => /Schedule C\/C1 must be yes or no/.test(x)), rows.get('S34-IMP3'));
  check('preview: switched-off category fails with a plain reason', rows.get('S34-IMP4')?.errors?.some((x) => /Category "S34 Old Tonic Syrups" is switched off/.test(x)), rows.get('S34-IMP4'));
  check('preview: switched-off HSN code fails with a plain reason', rows.get('S34-IMP5')?.errors?.some((x) => /HSN code 99343401 is switched off/.test(x)), rows.get('S34-IMP5'));
  r = await send('/catalogue/import/commit', buf);
  check('commit refuses a file with errors', r.status === 422, r.json);
  r = await send('/catalogue/import/commit?skip_errors=true', buf);
  const made = new Map((await q(`SELECT sku, schedule_c_c1 FROM products WHERE sku LIKE 'S34-IMP%'`)).map((x) => [x.sku, x.schedule_c_c1]));
  check('commit without the error rows: Schedule C / C1 saved as given', r.status === 200 && made.get('S34-IMP1') === true && made.get('S34-IMP2') === false
    && !made.has('S34-IMP3') && !made.has('S34-IMP4') && !made.has('S34-IMP5'), [r.json, [...made]]);
  // A later file without the column keeps what the pharmacist set
  const again = await workbook([row('S34-IMP1', 'S34 Importvaccine Injection', 'S34 Smoke', '3004', '')]);
  r = await send('/catalogue/import/commit', again);
  const kept = await q(`SELECT schedule_c_c1 FROM products WHERE sku = 'S34-IMP1'`);
  check('a blank cell later does not unmark it', r.status === 200 && kept[0]?.schedule_c_c1 === true, [r.json, kept]);
}
