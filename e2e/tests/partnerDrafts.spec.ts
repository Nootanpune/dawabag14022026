// Sprint 29 — an admin turns partners' new-product requests into draft products in one
// go; a pharmacist completes one in "New products to complete" and approves it, and
// closes another as "not a medicine we list". Desktop and phone.
// Data: vendor 'E2E S29 Partner <project>', made-up items 'E2E ZYLOPRIN…' / 'E2E GLIMMER…'
// (company code E2EQ<project>); removed here and by the global cleanup (vendors 'E2E %',
// drafts named 'E2E %').
import { expect, test, type Locator, type Page } from '@playwright/test';
import { call, db } from '../support/data';
import { expectNoBrowserStorage, signIn } from '../support/helpers';

// The pharmacist's test works on the drafts the admin's test made
test.describe.configure({ mode: 'serial' });

let company = '';
let vendorName = '';

async function removeOld(c: ReturnType<typeof db>) {
  const vendors = (await c.query('SELECT id FROM vendors WHERE name = $1', [vendorName])).rows.map((r) => r.id);
  const products = (await c.query(
    `SELECT product_id AS id FROM catalogue_drafts WHERE from_file->>'company' = $1
     UNION SELECT product_id FROM partner_product_requests WHERE partner_id = ANY($2) AND product_id IS NOT NULL`, [company, vendors])).rows.map((r) => r.id);
  await c.query("SET dawabag.maintenance = 'on'");
  await c.query(`DELETE FROM audit_logs WHERE new_value->>'product_id' = ANY($1::text[])`, [products]);
  await c.query('DELETE FROM partner_product_requests WHERE partner_id = ANY($1) OR product_id = ANY($2)', [vendors, products]);
  await c.query('DELETE FROM partner_item_links WHERE partner_id = ANY($1) OR product_id = ANY($2)', [vendors, products]);
  await c.query('UPDATE products SET content_reviewed_by = NULL WHERE id = ANY($1)', [products]);
  await c.query('DELETE FROM catalogue_drafts WHERE product_id = ANY($1)', [products]);
  await c.query('DELETE FROM products WHERE id = ANY($1)', [products]);
  await c.query('DELETE FROM vendors WHERE id = ANY($1)', [vendors]);
}

test.beforeAll(async ({}, info) => {
  company = `E2EQ${info.project.name.toUpperCase()}`;
  vendorName = `E2E S29 Partner ${info.project.name}`;
  const c = db();
  await c.connect();
  try {
    await removeOld(c);
    const vendor = (await c.query(
      `INSERT INTO vendors (name, drug_license_no, gst_number, pincode, city, state, vendor_type, approval_status, is_active, drug_license_type, drug_license_expiry)
       VALUES ($1, $2, '27ABCDE2929F1Z5', '411001', 'Pune', 'Maharashtra', 'marketplace_partner', 'approved', TRUE, 'dl20b', CURRENT_DATE + 400)
       RETURNING id`, [vendorName, `DL-E2E-S29-${info.project.name}`])).rows[0].id;
    // Two spellings of the same item (grouped into one draft) and a cosmetic
    const items = [
      ['E2E ZYLOPRIN 5MG TAB', '10 TAB', 5, 4200], ['E2E Zyloprin 5 mg Tab', "10's", 5, 4200], ['E2E GLIMMER CREAM 20GM', '20 GM', 18, 12000],
    ];
    for (const [name, pack, gst, mrp] of items) {
      await c.query(
        `INSERT INTO partner_product_requests (partner_id, item_key, item_name, pack, manufacturer, gst_rate, mrp_paise)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`, [vendor, `name:${String(name).toLowerCase()}|${pack}|${company}`, name, pack, company, gst, mrp]);
    }
  } finally { await c.end(); }
});

test.afterAll(async () => {
  const c = db();
  await c.connect();
  try { await removeOld(c); } finally { await c.end(); }
});

/** Types into a field and waits until the server has saved it. */
async function saveText(page: Page, card: Locator, label: string, value: string) {
  await card.getByLabel(label, { exact: true }).fill(value);
  await Promise.all([
    page.waitForResponse((r) => /\/catalogue-drafts\/[0-9a-f-]{36}$/.test(r.url()) && r.request().method() === 'PATCH' && r.ok()),
    card.getByLabel(label, { exact: true }).press('Enter'),
  ]);
}
async function choose(page: Page, card: Locator, label: string, value: string) {
  await Promise.all([
    page.waitForResponse((r) => /\/catalogue-drafts\/[0-9a-f-]{36}$/.test(r.url()) && r.request().method() === 'PATCH' && r.ok()),
    card.getByLabel(label, { exact: true }).selectOption(value),
  ]);
}

test('admin creates drafts from partner requests; buyers cannot see them', async ({ page }) => {
  await signIn(page, 'admin');
  await page.goto('/admin/partner-stock');
  await expect(page.getByRole('heading', { name: 'Partner stock files' })).toBeVisible();
  const list = page.getByRole('list', { name: 'Partner product requests' });
  for (const name of ['E2E ZYLOPRIN 5MG TAB', 'E2E Zyloprin 5 mg Tab', 'E2E GLIMMER CREAM 20GM']) {
    await list.getByRole('checkbox', { name: `Choose ${name}` }).check();
  }
  await page.getByRole('button', { name: 'Create drafts (3)' }).click();
  const result = page.getByTestId('drafts-created');
  await expect(result).toContainText('2 new draft products for 3 requests');
  await expect(result).toContainText('1 were the same item and share a draft');
  await result.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Drafts being completed' }).click();
  await expect(page.getByText(/Draft: E2E ZYLOPRIN 5MG TAB — waiting for the pharmacist/).first()).toBeVisible();

  // Not in the shop until approved
  const search = await call('GET', '/products/search?q=Zyloprin');
  expect(search.json.data.products.map((p: any) => p.name)).not.toContain('E2E ZYLOPRIN 5MG TAB');
  await expectNoBrowserStorage(page);
});

test('the pharmacist completes and approves one new product and closes another', async ({ page }) => {
  await signIn(page, 'pharmacist');
  await page.goto('/staff/new-products');
  await expect(page.getByRole('heading', { name: 'New products to complete' })).toBeVisible();
  await expect(page.getByTestId('drafts-progress')).toContainText(/\d+ of \d+ done/);
  await page.getByLabel('Company', { exact: true }).selectOption(company);
  const cards = page.getByRole('list', { name: 'New products' });
  await expect(cards.getByTestId('draft-card')).toHaveCount(2);

  // Bulk: a non-clinical detail for both
  await page.getByLabel('Choose all on this page').check();
  const bulk = page.getByRole('form', { name: 'Set for all chosen' });
  await bulk.getByLabel('Detail').selectOption('category');
  await bulk.getByLabel('Value').fill('E2E Pain relief');
  await bulk.getByRole('button', { name: 'Set', exact: true }).click();
  await expect(page.getByText('Set on 2 products')).toBeVisible();

  const card = cards.getByRole('listitem', { name: 'E2E ZYLOPRIN 5MG TAB' });
  await expect(card.getByText('From the partner\'s file')).toBeVisible();
  await expect(card.getByText(/Still needed: Choose the drug schedule/)).toBeVisible();
  await choose(page, card, 'Drug schedule', 'Schedule H');
  await expect(card.getByText('Prescription needed for patients (C-08)')).toBeVisible();
  await saveText(page, card, 'Generic name', 'Zyloprin');
  await saveText(page, card, 'Strength', '5 mg');
  await choose(page, card, 'Dosage form', 'Tablet');
  await choose(page, card, 'Cold chain (2–8 °C)', 'no');
  await saveText(page, card, 'HSN code', '30049099');
  await choose(page, card, 'GST rate', '5');
  await saveText(page, card, 'Manufacturer name', 'E2E Zylo Remedies Pvt Ltd');
  await saveText(page, card, 'Manufacturer address', 'Plot 29, Demo Industrial Area, Pune 411026');
  await saveText(page, card, 'Country of origin', 'India');
  await Promise.all([
    page.waitForResponse((r) => /\/catalogue-drafts\//.test(r.url()) && r.request().method() === 'PATCH' && r.ok()),
    card.getByRole('button', { name: /^Use: “Zyloprin 5 mg tablet/ }).click(),
  ]);
  await expect(card.getByText('Ready to approve')).toBeVisible();
  await card.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.getByText('Approved: now in the catalogue')).toBeVisible();
  await expect(cards.getByRole('listitem', { name: 'E2E ZYLOPRIN 5MG TAB' })).toHaveCount(0);

  const other = cards.getByRole('listitem', { name: 'E2E GLIMMER CREAM 20GM' });
  await other.getByRole('button', { name: 'Not a medicine we list' }).click();
  await page.getByRole('dialog').getByRole('textbox').fill('Cosmetic, not a medicine we list');
  await page.getByRole('dialog').getByRole('button', { name: 'Close it' }).click();
  await expect(cards.getByTestId('draft-card')).toHaveCount(0);

  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(cards.getByText('Approved — in the catalogue')).toBeVisible();
  await expect(cards.getByText('Not listed', { exact: true })).toBeVisible();

  // Now a buyer finds the approved product; the closed one stays out
  const search = await call('GET', '/products/search?q=Zyloprin');
  expect(search.json.data.products.map((p: any) => p.name)).toContain('E2E ZYLOPRIN 5MG TAB');
  const glimmer = await call('GET', '/products/search?q=Glimmer');
  expect(glimmer.json.data.products.map((p: any) => p.name)).not.toContain('E2E GLIMMER CREAM 20GM');
  await expectNoBrowserStorage(page);
});
