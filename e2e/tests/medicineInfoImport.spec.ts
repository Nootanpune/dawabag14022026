// Sprint 45 — "Import medicine information drafts": the template download, choosing the
// partner, uploading a drafts workbook, the result (draft created, row not in the
// catalogue yet with its CSV), the pharmacist's "Imported drafts to check" list and the
// yellow banner in the editor. Desktop only (staff screens). Made-up demo items only:
// vendor 'E2E S45 …', SKU E2E-S45-* (both removed by the shared clean-up).
import { createRequire } from 'module';
import path from 'path';
import { expect, test } from '@playwright/test';
import { call, db, people } from '../support/data';
import { expectNoBrowserStorage, signIn } from '../support/helpers';

// exceljs comes from the API's own dependencies (the browser tests run next to the API)
const ExcelJS = createRequire(path.resolve(__dirname, '../../backend/package.json'))('exceljs');

test.describe.configure({ mode: 'serial' });

const HEAD = ['item_name', 'pack', 'company', 'assumed_composition', 'composition_confidence', 'drafting_note', 'content_json'];
const ITEM = ['E2E S45 DEMOVIR 200 TAB', '10 TAB', 'E2EDEMO'];
const S: { vendor?: string; product?: string } = {};
const isPhone = (name: string) => name === 'phone';
const itemKey = ([name, pack, company]: string[]) => {
  const clean = (v: string) => v.toLowerCase().normalize('NFKC').replace(/[^a-z0-9%.]+/g, ' ').trim().replace(/\s+/g, ' ');
  return `name:${clean(name)}|${clean(pack)}|${clean(company)}`;
};

async function draftsWorkbook(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('drafts');
  ws.addRow(HEAD);
  ws.addRow([...ITEM, 'Demovir 200 mg', 'medium', 'Strength read from the demo strip',
    JSON.stringify({ overview: 'E2E Demovir demo overview.', uses: ['Demo use'], references: [{ source: 'Demo pack insert', date: 'May 2026' }] })]);
  ws.addRow(['E2E S45 UNLINKED 1 TAB', '1', 'E2EDEMO', 'Unlinked 1 mg', 'low', '', JSON.stringify({ overview: 'E2E unlinked demo.' })]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

test.beforeAll(async () => {
  const c = db();
  await c.connect();
  try {
    S.vendor = (await c.query(`SELECT id FROM vendors WHERE name = 'E2E S45 Demo Partner'`)).rows[0]?.id ?? (await c.query(
      `INSERT INTO vendors (name, drug_license_no, gst_number, pincode, city, state, latitude, longitude, vendor_type, approval_status, is_active,
                            invoice_prefix, drug_license_type, drug_license_expiry)
       VALUES ('E2E S45 Demo Partner', 'DL-E2E-S45', '27ABCDE1945F1Z5', '499919', 'Nashik', 'Maharashtra', 20.0, 73.8, 'marketplace_partner',
               'approved', TRUE, 'E2S45', 'dl20b', CURRENT_DATE + 500) RETURNING id`)).rows[0].id;
    S.product = (await c.query(`SELECT id FROM products WHERE sku = 'E2E-S45-DEMOVIR'`)).rows[0]?.id ?? (await c.query(
      `INSERT INTO products (name, generic_name, sku, category, drug_schedule, gst_rate, hsn_code, mrp_paise, offer_price_paise, net_quantity,
                             manufacturer_name, manufacturer_address, country_of_origin, is_active)
       VALUES ('E2E Demovir 200 mg Tablet', 'E2E Demovir', 'E2E-S45-DEMOVIR', 'Pain relief', 'OTC', 12, '30049099', 1000, 900, '10 tablets',
               'E2E Demo Labs', 'Plot 45, Demo Estate', 'India', TRUE) RETURNING id`)).rows[0].id;
    await c.query(`DELETE FROM product_info_versions WHERE product_id = $1`, [S.product]);
    await c.query(`INSERT INTO partner_item_links (partner_id, item_key, product_id, item_label, source) VALUES ($1, $2, $3, $4, 'admin')
                   ON CONFLICT (partner_id, item_key) DO UPDATE SET product_id = EXCLUDED.product_id`, [S.vendor, itemKey(ITEM), S.product, ITEM[0]]);
  } finally { await c.end(); }
});

test.afterAll(async () => {
  const c = db();
  await c.connect();
  try { if (S.product) await c.query(`DELETE FROM product_info_versions WHERE product_id = $1`, [S.product]); } finally { await c.end(); }
});

test('admin imports drafts for a partner: template, upload, result, CSV of rows not in the catalogue', async ({ page }, info) => {
  test.skip(isPhone(info.project.name), 'staff screens are checked on desktop');
  await signIn(page, 'admin');
  await page.goto('/staff/medicine-info-imports');
  await expect(page.getByRole('heading', { name: 'Import medicine information drafts', level: 1 })).toBeVisible();

  const [template] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download template' }).click()]);
  expect(template.suggestedFilename()).toBe('medicine_information_drafts_template.xlsx');

  // Nothing chosen yet: the page says what is missing
  await page.getByRole('button', { name: 'Import drafts' }).click();
  await expect(page.getByRole('form', { name: 'Import medicine information drafts' }).getByRole('alert')).toContainText('Choose the partner');

  await page.getByLabel('Partner').selectOption(S.vendor!);
  await page.getByTestId('drafts-file').setInputFiles({ name: 'demo_drafts.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: await draftsWorkbook() });
  await Promise.all([
    page.waitForResponse((r) => /\/medicines\/info-imports$/.test(r.url()) && r.request().method() === 'POST' && r.ok()),
    page.getByRole('button', { name: 'Import drafts' }).click(),
  ]);
  const result = page.getByTestId('import-result');
  await expect(result).toContainText('E2E S45 Demo Partner: 2 rows');
  await expect(page.getByTestId('count-created')).toContainText('1');
  await expect(page.getByTestId('count-not_in_catalogue')).toContainText('1');
  await expect(result.getByTestId('import-row').filter({ hasText: 'E2E S45 DEMOVIR 200 TAB' })).toContainText('Draft created');
  await expect(result.getByTestId('import-row').filter({ hasText: 'E2E S45 UNLINKED 1 TAB' })).toContainText('Not in catalogue yet');
  const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /rows not in the catalogue yet/ }).click()]);
  expect(csv.suggestedFilename()).toMatch(/^not_in_catalogue_.*\.csv$/);
  await expectNoBrowserStorage(page);

  // Buyers see nothing yet
  expect((await call('GET', `/medicines/${S.product}/info`)).json.data.available).toBe(false);
});

test('the pharmacist sees it in "Imported drafts to check" and the editor shows the yellow banner', async ({ page }, info) => {
  test.skip(isPhone(info.project.name), 'staff screens are checked on desktop');
  await signIn(page, 'pharmacist');
  await page.goto('/staff/medicine-info-approvals');
  await expect(page.getByTestId('imported-draft-counts')).toContainText('E2E S45 Demo Partner');
  await page.goto(`/staff/medicine-info-imported?partner=${S.vendor}`);
  await expect(page.getByRole('heading', { name: 'Imported drafts to check', level: 1 })).toBeVisible();
  const row = page.getByTestId('imported-draft').filter({ hasText: 'E2E Demovir 200 mg Tablet' });
  await expect(row).toContainText('Assumed composition: Demovir 200 mg (confidence medium)');
  await row.getByRole('link', { name: 'Check and send' }).click();
  const banner = page.getByTestId('imported-draft-banner');
  await expect(banner).toContainText('Imported draft — written outside Dawabag. Check every line against the pack insert.');
  await expect(banner).toContainText('Assumed composition: Demovir 200 mg (confidence medium). Note: Strength read from the demo strip');
  await expect(page.getByLabel('Overview', { exact: true })).toHaveValue('E2E Demovir demo overview.');
  await Promise.all([
    page.waitForResponse((r) => /\/info\/submit$/.test(r.url()) && r.ok()),
    page.getByRole('button', { name: 'Send for pharmacist review' }).click(),
  ]);
  await expect(page.getByTestId('info-status')).toContainText('Waiting for pharmacist review');
  // The pharmacist who checked and sent it is its author: another pharmacist must approve
  const ph = (await call('POST', '/auth/login', { mobile: people.pharmacist.mobile, password: people.pharmacist.password })).json.data?.access_token;
  const r = await call('POST', `/medicines/${S.product}/info/review`, { approve: true, notes: 'Approving what I sent.' }, ph);
  expect(r.status).toBe(403);
  await expectNoBrowserStorage(page);
});
