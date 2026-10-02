import { expect, test } from '@playwright/test';
import { db } from '../support/data';
import { signIn } from '../support/helpers';

test('an admin lands on the admin area and opens the recall alert register', async ({ page }) => {
  await signIn(page, 'admin');
  await expect(page).toHaveURL(/\/admin/);
  await page.goto('/admin/recall-alerts');
  await expect(page.getByRole('heading', { name: /recall alerts/i }).first()).toBeVisible();
});

test('a buyer cannot open the admin area', async ({ page }) => {
  await signIn(page, 'buyer');
  await page.goto('/admin');
  await expect(page).not.toHaveURL(/\/admin$/);
});

test('a pharmacist lands on the fulfilment queue', async ({ page }) => {
  await signIn(page, 'pharmacist');
  await expect(page).toHaveURL(/\/staff\//);
  await expect(page.getByText(/prescription/i).first()).toBeVisible();
});

test('an admin sees the pack photo panel; a non-image is refused before upload', async ({ page }) => {
  await signIn(page, 'admin');
  await page.goto(`/admin/products/${process.env.E2E_PRODUCT_ID}`);
  const panel = page.getByRole('region', { name: 'Pack photo' });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Upload photo' })).toBeVisible();
  await panel.getByLabel('Pack photo file').setInputFiles({ name: 'leaflet.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7') });
  await expect(panel.getByRole('alert')).toHaveText(/JPEG, PNG or WebP/);
});

test('an admin opens bulk pack photos and sees which SKU each file maps to before upload', async ({ page }) => {
  await signIn(page, 'admin');
  await page.goto('/admin/products/photos');
  await expect(page.getByRole('heading', { name: 'Pack photos' })).toBeVisible();
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await page.getByLabel('Photo files').setInputFiles([
    { name: 'E2E-PARA.png', mimeType: 'image/png', buffer: png },
    { name: 'e2e-para.jpg', mimeType: 'image/jpeg', buffer: png },
    { name: 'leaflet.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7') },
  ]);
  const table = page.getByRole('table', { name: 'Photos to upload' });
  await expect(table.getByRole('row', { name: /E2E-PARA\.png E2E-PARA .* Ready/ })).toBeVisible();
  await expect(table.getByRole('row', { name: /e2e-para\.jpg .*Another file in this selection has this SKU/ })).toBeVisible();
  await expect(table.getByRole('row', { name: /leaflet\.pdf .*Only \.jpg/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Upload 1 photo' })).toBeEnabled();
});

// Sprint 31: the product form chooses category / HSN from the server's lists; Alt+C adds one;
// "Non-scheduled" is a schedule of its own. Nothing is saved here except the new category.
test('an admin adds a category from the product form with Alt+C and sees Non-scheduled', async ({ page }) => {
  const name = 'E2E Form category';
  const clean = async () => {
    const c = db();
    await c.connect();
    try {
      await c.query("SET dawabag.maintenance = 'on'");
      await c.query(`DELETE FROM audit_logs WHERE action = 'product_category_created' AND new_value->>'name' = $1`, [name]);
      await c.query('DELETE FROM product_categories WHERE name = $1', [name]);
    } finally { await c.end(); }
  };
  await clean();
  try {
    await signIn(page, 'admin');
    await page.goto('/admin/products/new');
    await page.getByLabel('Drug schedule').selectOption('Non-scheduled');
    await expect(page.getByText('In no schedule: no prescription needed')).toBeVisible();
    const field = page.getByRole('combobox', { name: 'Category' });
    await field.fill(name);
    await field.press('Alt+KeyC');
    const dialog = page.getByRole('dialog').filter({ hasText: 'New category' });
    await expect(dialog.getByLabel('Category name')).toHaveValue(name);
    await dialog.getByRole('button', { name: 'Add and choose' }).click();
    await expect(field).toHaveValue(name);
    // Alt+C outside the two list fields does nothing
    await page.getByLabel('Brand name').press('Alt+KeyC');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  } finally { await clean(); }
});
