// Sprint 46 — "Import catalogue suggestions": template download, choosing the partner,
// uploading a suggestions workbook, the result (suggestion added to a draft, a row with no
// draft yet), then the pharmacist's "New products to complete" form pre-filled with the
// suggestion ("Suggested — check against the pack") — nothing saved until the pharmacist
// presses "Use". Desktop only (staff screens). Made-up demo items only: vendor
// 'E2E S46 …', SKU E2E-S46-* (both removed by the shared clean-up).
import { createRequire } from 'module';
import path from 'path';
import { expect, test } from '@playwright/test';
import { db } from '../support/data';
import { expectNoBrowserStorage, signIn } from '../support/helpers';

// exceljs comes from the API's own dependencies (the browser tests run next to the API)
const ExcelJS = createRequire(path.resolve(__dirname, '../../backend/package.json'))('exceljs');

test.describe.configure({ mode: 'serial' });

const HEAD = ['item_name', 'pack', 'company', 'generic_name', 'strength', 'dosage_form', 'drug_schedule', 'cold_chain',
  'product_class', 'is_new_drug', 'category', 'hsn_code', 'gst_rate', 'confidence', 'note'];
const ITEM = ['E2E S46 DEMOFLOX 200 TAB', '10 TAB', 'E2EDEMO'];
const S: { vendor?: string; product?: string } = {};
const isPhone = (name: string) => name === 'phone';
const itemKey = ([name, pack, company]: string[]) => {
  const clean = (v: string) => v.toLowerCase().normalize('NFKC').replace(/[^a-z0-9%.]+/g, ' ').trim().replace(/\s+/g, ' ');
  return `name:${clean(name)}|${clean(pack)}|${clean(company)}`;
};

async function suggestionsWorkbook(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('suggestions');
  ws.addRow(HEAD);
  ws.addRow([...ITEM, 'E2E Demofloxacin', '200 mg', 'Tablet', 'Schedule H', 'no', 'drug', 'no', 'E2E S46 Demo Category', '30049099', '12',
    'high', 'Strength read from the demo strip']);
  ws.addRow(['E2E S46 NODRAFT 1 TAB', '1', 'E2EDEMO', 'E2E Nodraft', '1 mg', 'Tablet', 'H', 'no', 'drug', 'no', '', '', '12', 'low', '']);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const draftRow = async () => {
  const c = db();
  await c.connect();
  try { return (await c.query('SELECT generic_name, drug_schedule, strength FROM products WHERE id = $1', [S.product])).rows[0]; } finally { await c.end(); }
};

test.beforeAll(async () => {
  const c = db();
  await c.connect();
  try {
    S.vendor = (await c.query(`SELECT id FROM vendors WHERE name = 'E2E S46 Demo Partner'`)).rows[0]?.id ?? (await c.query(
      `INSERT INTO vendors (name, drug_license_no, gst_number, pincode, city, state, latitude, longitude, vendor_type, approval_status, is_active,
                            invoice_prefix, drug_license_type, drug_license_expiry)
       VALUES ('E2E S46 Demo Partner', 'DL-E2E-S46', '27ABCDE1946F1Z5', '499919', 'Nashik', 'Maharashtra', 20.0, 73.8, 'marketplace_partner',
               'approved', TRUE, 'E2S46', 'dl20b', CURRENT_DATE + 500) RETURNING id`)).rows[0].id;
    // A draft product exactly as Sprint 29 "Create drafts" leaves it (nothing clinical decided)
    S.product = (await c.query(`SELECT id FROM products WHERE sku = 'E2E-S46-DRAFT'`)).rows[0]?.id;
    if (!S.product) {
      S.product = (await c.query(
        `INSERT INTO products (name, sku, category, drug_schedule, gst_rate, marketed_by, net_quantity, mrp_paise, offer_price_paise,
                               is_active, catalogue_state, content_status, country_of_origin, cold_chain)
         VALUES ($1, 'E2E-S46-DRAFT', NULL, NULL, NULL, 'E2EDEMO', '10 TAB', 1500, 1500, FALSE, 'draft', 'pending_review', NULL, FALSE) RETURNING id`,
        [ITEM[0]])).rows[0].id;
      await c.query(`INSERT INTO catalogue_drafts (product_id, source, from_file) VALUES ($1, 'partner_request', $2)`,
        [S.product, JSON.stringify({ partner_id: S.vendor, partner_name: 'E2E S46 Demo Partner', item_name: ITEM[0], pack: ITEM[1], company: ITEM[2],
          gst_rate: null, mrp_paise: 1500, hsn_code: null })]);
    }
    await c.query(`INSERT INTO partner_item_links (partner_id, item_key, product_id, item_label, source) VALUES ($1, $2, $3, $4, 'admin')
                   ON CONFLICT (partner_id, item_key) DO UPDATE SET product_id = EXCLUDED.product_id`, [S.vendor, itemKey(ITEM), S.product, ITEM[0]]);
  } finally { await c.end(); }
});

test('admin imports catalogue suggestions for a partner: template, upload, result', async ({ page }, info) => {
  test.skip(isPhone(info.project.name), 'staff screens are checked on desktop');
  await signIn(page, 'admin');
  await page.goto('/staff/catalogue-suggestions');
  await expect(page.getByRole('heading', { name: 'Import catalogue suggestions', level: 1 })).toBeVisible();

  const [template] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download template' }).click()]);
  expect(template.suggestedFilename()).toBe('catalogue_suggestions_template.xlsx');
  await expect(page.getByTestId('suggestion-allowed-values')).toContainText('Non-scheduled');

  await page.getByRole('button', { name: 'Import suggestions' }).click();
  await expect(page.getByRole('form', { name: 'Import catalogue suggestions' }).getByRole('alert')).toContainText('Choose the partner');

  await page.getByLabel('Partner').selectOption(S.vendor!);
  await page.getByTestId('suggestions-file').setInputFiles({ name: 'demo_suggestions.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: await suggestionsWorkbook() });
  await Promise.all([
    page.waitForResponse((r) => /\/catalogue-suggestions\/imports$/.test(r.url()) && r.request().method() === 'POST' && r.ok()),
    page.getByRole('button', { name: 'Import suggestions' }).click(),
  ]);
  const result = page.getByTestId('suggestion-result');
  await expect(result).toContainText('E2E S46 Demo Partner: 2 rows');
  await expect(page.getByTestId('count-attached')).toContainText('1');
  await expect(page.getByTestId('count-no_draft_yet')).toContainText('1');
  await expect(page.getByTestId('count-flagged')).toContainText('1');
  await expect(result.getByTestId('suggestion-row').filter({ hasText: ITEM[0] })).toContainText('Suggestion added');
  await expect(result.getByTestId('suggestion-row').filter({ hasText: ITEM[0] })).toContainText('New category "E2E S46 Demo Category"');
  await expect(result.getByTestId('suggestion-row').filter({ hasText: 'E2E S46 NODRAFT 1 TAB' })).toContainText('No draft yet');
  await expect(page.getByTestId('no-draft-hint')).toContainText('Create drafts');
  const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /rows with no draft yet/ }).click()]);
  expect(csv.suggestedFilename()).toMatch(/^no_draft_yet_.*\.csv$/);
  await expectNoBrowserStorage(page);
  // The import decided nothing
  expect(await draftRow()).toEqual({ generic_name: null, drug_schedule: null, strength: null });
});

test('the pharmacist\'s form is pre-filled with the suggestion; nothing is saved until "Use"', async ({ page }, info) => {
  test.skip(isPhone(info.project.name), 'staff screens are checked on desktop');
  await signIn(page, 'pharmacist');
  await page.goto('/staff/new-products?suggested=1');
  await expect(page.getByRole('heading', { name: 'New products to complete', level: 1 })).toBeVisible();
  await expect(page.getByTestId('suggestion-counts')).toContainText('With suggestions');
  const card = page.getByTestId('draft-card').filter({ hasText: ITEM[0] });
  const panel = card.getByTestId('draft-suggestion');
  await expect(panel).toContainText('Suggested — check against the pack');
  await expect(panel.getByTestId('suggestion-confidence')).toHaveText('High confidence');
  await expect(panel.getByTestId('suggestion-note')).toContainText('Strength read from the demo strip');
  await expect(panel).toContainText('New category "E2E S46 Demo Category"');

  // Pre-filled, marked, not saved
  const generic = card.getByLabel('Generic name', { exact: true });
  await expect(generic).toHaveValue('E2E Demofloxacin');
  await expect(card.getByLabel('Drug schedule')).toHaveValue('Schedule H');
  await expect(card.getByLabel('Strength', { exact: true })).toHaveValue('200 mg');
  await expect(card.getByTestId('suggested-note').first()).toContainText('Suggested — check against the pack');
  await generic.focus();
  await generic.blur();
  expect(await draftRow()).toEqual({ generic_name: null, drug_schedule: null, strength: null });
  await expect(card).toContainText('Still needed: Choose the drug schedule');

  // The pharmacist checks the strength against the pack and types their own value; uses the suggested schedule
  const strength = card.getByLabel('Strength', { exact: true });
  await strength.fill('250 mg');
  await Promise.all([
    page.waitForResponse((r) => /\/catalogue-drafts\/[^/]+$/.test(r.url()) && r.request().method() === 'PATCH' && r.ok()),
    strength.blur(),
  ]);
  const schedule = card.getByLabel('Drug schedule').locator('..');
  await Promise.all([
    page.waitForResponse((r) => /\/catalogue-drafts\/[^/]+$/.test(r.url()) && r.request().method() === 'PATCH' && r.ok()),
    schedule.getByRole('button', { name: 'Use' }).click(),
  ]);
  await expect.poll(draftRow).toEqual({ generic_name: null, drug_schedule: 'Schedule H', strength: '250 mg' });
  await expect(card.getByText('Only a pharmacist can approve (C-19)')).toHaveCount(0);
  await expect(card.getByRole('button', { name: 'Approve', exact: true })).toBeDisabled();
  await expectNoBrowserStorage(page);
});
