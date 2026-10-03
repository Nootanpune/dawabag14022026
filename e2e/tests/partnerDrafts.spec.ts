// Sprint 29 — an admin turns partners' new-product requests into draft products in one
// go; a pharmacist completes one in "New products to complete" and approves it, and
// closes another as "not a medicine we list". Desktop and phone.
// Sprint 31 — a new category and HSN code are added from the queue (Alt+C on desktop,
// "+ New" on the phone), the product is saved and approved without a description and
// one is added afterwards (back to the C-19 copy review); "Non-scheduled" is offered.
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
let project = '';
let categoryName = '';
let hsnCode = '';

async function removeOld(c: ReturnType<typeof db>) {
  const vendors = (await c.query('SELECT id FROM vendors WHERE name = $1', [vendorName])).rows.map((r) => r.id);
  const products = (await c.query(
    `SELECT product_id AS id FROM catalogue_drafts WHERE from_file->>'company' = $1
     UNION SELECT product_id FROM partner_product_requests WHERE partner_id = ANY($2) AND product_id IS NOT NULL`, [company, vendors])).rows.map((r) => r.id);
  await c.query("SET ROLE dawabag_maintenance; SET dawabag.maintenance = 'on'");
  await c.query(`DELETE FROM audit_logs WHERE new_value->>'product_id' = ANY($1::text[])`, [products]);
  await c.query('DELETE FROM partner_product_requests WHERE partner_id = ANY($1) OR product_id = ANY($2)', [vendors, products]);
  await c.query('DELETE FROM partner_item_links WHERE partner_id = ANY($1) OR product_id = ANY($2)', [vendors, products]);
  await c.query('UPDATE products SET content_reviewed_by = NULL WHERE id = ANY($1)', [products]);
  await c.query('DELETE FROM catalogue_drafts WHERE product_id = ANY($1)', [products]);
  await c.query('DELETE FROM products WHERE id = ANY($1)', [products]);
  await c.query('DELETE FROM vendors WHERE id = ANY($1)', [vendors]);
  // Sprint 31: the category and HSN code this project added
  await c.query(`DELETE FROM audit_logs WHERE (action = 'product_category_created' AND new_value->>'name' = $1)
                 OR (action IN ('hsn_code_created', 'hsn_code_completed') AND new_value->>'code' = $2)`, [categoryName, hsnCode]);
  await c.query('DELETE FROM product_categories WHERE lower(name) = lower($1)', [categoryName]);
  await c.query('DELETE FROM hsn_codes WHERE code = $1', [hsnCode]);
}

test.beforeAll(async ({}, info) => {
  project = info.project.name;
  company = `E2EQ${info.project.name.toUpperCase()}`;
  categoryName = `E2E Pain relief ${info.project.name}`;
  hsnCode = info.project.name === 'phone' ? '99311902' : '99311901';
  vendorName = `E2E S29 Partner ${info.project.name}`;
  const c = db();
  await c.connect();
  try {
    await removeOld(c);
    const vendor = (await c.query(
      `INSERT INTO vendors (name, drug_license_no, gst_number, pincode, city, state, vendor_type, approval_status, is_active, drug_license_type, drug_license_expiry)
       VALUES ($1, $2, '27ABCDE2929F1Z5', '411001', 'Pune', 'Maharashtra', 'marketplace_partner', 'approved', TRUE, 'dl20b', CURRENT_DATE + 400)
       RETURNING id`, [vendorName, `DL-E2E-S29-${info.project.name}`])).rows[0].id;
    // Sprint 32: a partner sells only under checked licences in the register — retail and wholesale here
    await c.query(`INSERT INTO party_licences (vendor_id, form, licence_number, valid_upto, status, verified_at)
                   SELECT $1, f, $2, CURRENT_DATE + 400, 'verified', NOW() FROM unnest(ARRAY['dl20', 'dl21', 'dl20b', 'dl21b']) AS f`,
                  [vendor, `DL-E2E-S29-${info.project.name}`]);
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

  // Sprint 31: the keyboard help for quick-create
  await expect(page.getByTestId('quick-create-hint')).toContainText('Alt');

  // Bulk: a non-clinical detail for both — a category not yet in the list is added on the spot
  await page.getByLabel('Choose all on this page').check();
  const bulk = page.getByRole('form', { name: 'Set for all chosen' });
  await bulk.getByLabel('Detail').selectOption('category');
  const value = bulk.getByRole('combobox', { name: 'Value' });
  if (project === 'phone') {
    await bulk.getByRole('button', { name: '+ New category' }).click();
  } else {
    await value.fill(categoryName);
    await value.press('Alt+KeyC');   // Alt+C in the category field
  }
  const catDialog = page.getByRole('dialog').filter({ hasText: 'New category' });
  await expect(catDialog).toBeVisible();
  if (project === 'phone') await catDialog.getByLabel('Category name').fill(categoryName);
  else await expect(catDialog.getByLabel('Category name')).toHaveValue(categoryName);
  await catDialog.getByRole('button', { name: 'Add and choose' }).click();
  await expect(page.getByText(`Category “${categoryName}” added and chosen`)).toBeVisible();
  await expect(value).toHaveValue(categoryName);
  await bulk.getByRole('button', { name: 'Set', exact: true }).click();
  await expect(page.getByText('Set on 2 products')).toBeVisible();

  const card = cards.getByRole('listitem', { name: 'E2E ZYLOPRIN 5MG TAB' });
  await expect(card.getByText('From the partner\'s file')).toBeVisible();
  await expect(card.getByText(/Still needed: Choose the drug schedule/)).toBeVisible();
  await choose(page, card, 'Drug schedule', 'Schedule H');
  await expect(card.getByText('Prescription needed for patients (C-08)')).toBeVisible();
  await expect(card.getByRole('combobox', { name: 'Category' })).toHaveValue(categoryName);
  await saveText(page, card, 'Generic name', 'Zyloprin');
  await saveText(page, card, 'Strength', '5 mg');
  await choose(page, card, 'Dosage form', 'Tablet');
  await choose(page, card, 'Cold chain (2–8 °C)', 'no');
  await choose(page, card, 'GST rate', '5');

  // A new HSN code from the HSN field: Alt+C on desktop, "+ New" on the phone
  const hsn = card.getByRole('combobox', { name: 'HSN code' });
  if (project === 'phone') await card.getByRole('button', { name: '+ New HSN code' }).click();
  else { await hsn.focus(); await hsn.press('Alt+KeyC'); }
  const hsnDialog = page.getByRole('dialog').filter({ hasText: 'New HSN code' });
  await expect(hsnDialog).toBeVisible();
  await hsnDialog.getByLabel('HSN code').fill(hsnCode);
  await hsnDialog.getByLabel('Short description').fill('E2E made-up medicaments');
  await hsnDialog.getByLabel('Usual GST rate (optional)').selectOption('12');
  await Promise.all([
    page.waitForResponse((r) => /\/catalogue-drafts\/[0-9a-f-]{36}$/.test(r.url()) && r.request().method() === 'PATCH' && r.ok()),
    hsnDialog.getByRole('button', { name: 'Add and choose' }).click(),
  ]);
  await expect(hsn).toHaveValue(new RegExp(`^${hsnCode}`));
  // The HSN's usual GST (12%) differs from the product's (5%): a plain warning, GST unchanged
  await expect(card.getByText(`HSN ${hsnCode} usually has GST 12%, but this product is set to 5%`)).toBeVisible();
  await expect(card.getByLabel('GST rate', { exact: true })).toHaveValue('5');

  await saveText(page, card, 'Manufacturer name', 'E2E Zylo Remedies Pvt Ltd');
  await saveText(page, card, 'Manufacturer address', 'Plot 29, Demo Industrial Area, Pune 411026');
  await saveText(page, card, 'Country of origin', 'India');
  // No description: saved and ready all the same (it is optional)
  await expect(card.getByRole('button', { name: 'No description yet — add one' })).toBeVisible();
  await expect(card.getByText('Ready to approve')).toBeVisible();
  // Sprint 39 (C-10): the same form allows it for online sale, with a dated reference
  await expect(card.getByRole('button', { name: 'Approve', exact: true })).toBeDisabled();
  await card.getByLabel('Notification / approval reference').fill('E2E approval ref 39');
  await card.getByLabel('Date of the notification').fill(new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10));
  await card.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.getByText('Approved: in the catalogue and allowed online')).toBeVisible();
  await expect(cards.getByRole('listitem', { name: 'E2E ZYLOPRIN 5MG TAB' })).toHaveCount(0);

  const other = cards.getByRole('listitem', { name: 'E2E GLIMMER CREAM 20GM' });
  // Sprint 31: "Non-scheduled" is offered and needs no prescription
  await choose(page, other, 'Drug schedule', 'Non-scheduled');
  await expect(other.getByText('No prescription needed')).toBeVisible();
  await other.getByRole('button', { name: 'Not a medicine we list' }).click();
  await page.getByRole('dialog').getByRole('textbox').fill('Cosmetic, not a medicine we list');
  await page.getByRole('dialog').getByRole('button', { name: 'Close it' }).click();
  await expect(cards.getByTestId('draft-card')).toHaveCount(0);

  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(cards.getByText('Approved — in the catalogue')).toBeVisible();
  await expect(cards.getByText('Not listed', { exact: true })).toBeVisible();

  // The description is added after approval; it goes back to the pharmacist's copy check (C-19)
  const approved = cards.getByRole('listitem', { name: 'E2E ZYLOPRIN 5MG TAB' });
  await approved.getByRole('button', { name: 'No description yet — add one' }).click();
  await approved.getByLabel('Description for buyers (optional)').fill('Zyloprin 5 mg tablet. Pack: 10 TAB.');
  await approved.getByRole('button', { name: 'Save description' }).click();
  await expect(page.getByText(/Description saved: buyers see it once a pharmacist approves it/)).toBeVisible();
  await expect(approved.getByText(/Waiting for a pharmacist to approve it in Product copy/)).toBeVisible();

  // Now a buyer finds the approved product; the closed one stays out
  const search = await call('GET', '/products/search?q=Zyloprin');
  expect(search.json.data.products.map((p: any) => p.name)).toContain('E2E ZYLOPRIN 5MG TAB');
  const glimmer = await call('GET', '/products/search?q=Glimmer');
  expect(glimmer.json.data.products.map((p: any) => p.name)).not.toContain('E2E GLIMMER CREAM 20GM');
  await expectNoBrowserStorage(page);
});
