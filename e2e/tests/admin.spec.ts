import { expect, test } from '@playwright/test';
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
