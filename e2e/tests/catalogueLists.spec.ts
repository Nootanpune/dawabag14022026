// Sprint 32 — Admin → Catalogue lists in the browser (desktop and phone): the admin
// searches, renames a category (its product follows) and switches it off; edits a used
// HSN code's words (its number is locked) and corrects an unused one; a pharmacist sees
// the lists read-only. Data (made up): categories 'E2E S32 …', HSN codes 993219xx,
// product SKUs E2E-S32-LIST-x (global cleanup removes the product; the lists here).
import { expect, test } from '@playwright/test';
import { call, db, people } from '../support/data';
import { expectNoBrowserStorage, signIn } from '../support/helpers';

test.describe.configure({ mode: 'serial' });

let d: { tag: string; cat: string; renamed: string; used: string; unused: string; fixed: string; sku: string; dup: string; keep: string; sku2: string };

async function clearLists() {
  const c = db();
  await c.connect();
  try {
    await c.query("SET ROLE dawabag_maintenance; SET dawabag.maintenance = 'on'");
    await c.query(`DELETE FROM products WHERE sku = ANY($1)`, [[d.sku, d.sku2]]);
    await c.query(`DELETE FROM audit_logs WHERE action = 'product_category_merged' AND old_value->>'name' LIKE 'E2E S32 ${d.tag}%'`);
    await c.query(`DELETE FROM audit_logs WHERE new_value->>'name' LIKE 'E2E S32 ${d.tag}%' OR old_value->>'name' LIKE 'E2E S32 ${d.tag}%'
                   OR new_value->>'code' = ANY($1) OR old_value->>'code' = ANY($1)`, [[d.used, d.unused, d.fixed]]);
    await c.query(`DELETE FROM product_categories WHERE name_key LIKE $1`, [`e2e s32 ${d.tag.toLowerCase()}%`]);
    await c.query(`DELETE FROM hsn_codes WHERE code = ANY($1)`, [[d.used, d.unused, d.fixed]]);
  } finally { await c.end(); }
}

test.beforeAll(async ({}, info) => {
  const tag = info.project.name === 'phone' ? 'P' : 'D';
  const n = tag === 'P' ? '2' : '1';
  d = { tag, cat: `E2E S32 ${tag} Cough care`, renamed: `E2E S32 ${tag} Cough and cold`, used: `993219${n}0`, unused: `993219${n}1`,
    fixed: `993219${n}2`, sku: `E2E-S32-LIST-${tag}`,
    // Sprint 36: two categories for the same shelf, as made with Alt+C on different days
    dup: `E2E S32 ${tag} Cold rubs`, keep: `E2E S32 ${tag} Balms and rubs`, sku2: `E2E-S32-MERGE-${tag}` };
  await clearLists();
  const admin = (await call('POST', '/auth/login', { mobile: people.admin.mobile, password: people.admin.password })).json.data?.access_token;
  await call('POST', '/catalogue-lists/categories', { name: d.cat }, admin);
  await call('POST', '/catalogue-lists/hsn-codes', { code: d.used, description: 'E2E S32 used goods', gst_rate: 12 }, admin);
  await call('POST', '/catalogue-lists/hsn-codes', { code: d.unused, description: 'E2E S32 typo goods', gst_rate: 12 }, admin);
  const p = await call('POST', '/products', {
    name: `E2E S32 ${tag} Syrup`, sku: d.sku, category: d.cat, drug_schedule: 'OTC', gst_rate: 12, hsn_code: d.used,
    mrp_paise: 9000, offer_price_paise: 8500, max_qty_per_order: 5, net_quantity: '100 ml',
    manufacturer_name: 'E2E Pharma Ltd', manufacturer_address: 'Plot 19, MIDC Satpur, Nashik 422007', country_of_origin: 'India',
  }, admin);
  if (p.status !== 201) throw new Error(`Could not create the product: ${JSON.stringify(p.json)}`);
  await call('POST', '/catalogue-lists/categories', { name: d.dup }, admin);
  await call('POST', '/catalogue-lists/categories', { name: d.keep }, admin);
  const p2 = await call('POST', '/products', {
    name: `E2E S32 ${tag} Rub`, sku: d.sku2, category: d.dup, drug_schedule: 'OTC', gst_rate: 12,
    mrp_paise: 9000, offer_price_paise: 8500, max_qty_per_order: 5, net_quantity: '25 g',
    manufacturer_name: 'E2E Pharma Ltd', manufacturer_address: 'Plot 19, MIDC Satpur, Nashik 422007', country_of_origin: 'India',
  }, admin);
  if (p2.status !== 201) throw new Error(`Could not create the product: ${JSON.stringify(p2.json)}`);
});

test.afterAll(async () => { await clearLists(); });

test('admin renames a category (its product follows) and switches it off', async ({ page }) => {
  await signIn(page, 'admin');
  await page.goto('/admin/catalogue-lists');
  await expect(page.getByRole('heading', { name: 'Catalogue lists', level: 1 })).toBeVisible();
  await page.getByPlaceholder('Search categories').fill(`E2E S32 ${d.tag} Cough`);
  const row = page.getByTestId('category-row').filter({ hasText: d.cat });
  await expect(row).toContainText('Used by 1 product');
  await row.getByRole('button', { name: `Rename ${d.cat}` }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('New name').fill(d.renamed);
  await dialog.getByRole('button', { name: 'Rename' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('lists-message')).toHaveText(`Renamed to "${d.renamed}" — 1 product updated`);
  const renamed = page.getByTestId('category-row').filter({ hasText: d.renamed });
  await expect(renamed).toContainText('In the pick-list');

  await renamed.getByRole('button', { name: `Switch off ${d.renamed}` }).click();
  await expect(page.getByTestId('lists-message')).toContainText('switched off — products that have it keep it');
  await expect(renamed).toContainText('Switched off');
  await expect(renamed.getByRole('button', { name: `Switch on ${d.renamed}` })).toBeVisible();
  await expectNoBrowserStorage(page);
});

test('admin edits HSN codes: a used code keeps its number, an unused one is corrected', async ({ page }) => {
  await signIn(page, 'admin');
  await page.goto('/admin/catalogue-lists');
  await page.getByRole('button', { name: 'HSN codes' }).click();
  await page.getByPlaceholder('Search HSN codes or descriptions').fill(d.used.slice(0, 6));
  const used = page.getByTestId('hsn-row').filter({ hasText: d.used });
  await expect(used).toContainText('Used by 1 product');
  await used.getByRole('button', { name: `Edit HSN ${d.used}` }).click();
  let dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('HSN code')).toBeDisabled();
  await expect(dialog.getByText('Used by 1 product, so the code cannot be changed')).toBeVisible();
  await dialog.getByLabel('Description').fill('E2E S32 used goods, other');
  await dialog.getByLabel('Usual GST rate').selectOption('18');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
  await expect(used).toContainText('E2E S32 used goods, other');
  await expect(used).toContainText('Usual GST 18%');

  const unused = page.getByTestId('hsn-row').filter({ hasText: d.unused });
  await unused.getByRole('button', { name: `Edit HSN ${d.unused}` }).click();
  dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('HSN code')).toBeEnabled();
  await dialog.getByLabel('HSN code').fill(d.fixed);
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('lists-message')).toHaveText(`HSN ${d.fixed} saved`);
  await expect(page.getByTestId('hsn-row').filter({ hasText: d.fixed })).toBeVisible();
});

test('admin merges a duplicate category: its product moves, the old entry points at the new one (Sprint 36)', async ({ page }) => {
  await signIn(page, 'admin');
  await page.goto('/admin/catalogue-lists');
  await page.getByPlaceholder('Search categories').fill(d.dup);
  const row = page.getByTestId('category-row').filter({ hasText: d.dup });
  await expect(row).toContainText('Used by 1 product');
  await row.getByRole('button', { name: `Merge ${d.dup} into another category` }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Find the category to merge into').fill(d.keep);
  await dialog.getByRole('radio', { name: d.keep }).check();
  await dialog.getByLabel(/Why are they the same/).fill('Same shelf, added twice');
  await dialog.getByRole('button', { name: `Merge into ${d.keep}` }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('lists-message')).toHaveText(`"${d.dup}" merged into ${d.keep} — 1 product moved`);
  await expect(row).toContainText(`Merged into "${d.keep}"`);
  await expect(row).toContainText('Switched off');
  await expect(row.getByRole('button')).toHaveCount(0);
  const c = db();
  await c.connect();
  try {
    const { rows } = await c.query('SELECT category FROM products WHERE sku = $1', [d.sku2]);
    expect(rows[0].category).toBe(d.keep);
  } finally { await c.end(); }
});

test('a pharmacist sees the lists read-only', async ({ page }) => {
  await signIn(page, 'pharmacist');
  await page.goto('/admin/catalogue-lists');
  await expect(page.getByText('read-only — an admin can change them')).toBeVisible();
  await page.getByPlaceholder('Search categories').fill(`E2E S32 ${d.tag} Cough`);
  const row = page.getByTestId('category-row').filter({ hasText: d.renamed });
  await expect(row).toContainText('Switched off');
  await expect(row.getByRole('button')).toHaveCount(0);
});
