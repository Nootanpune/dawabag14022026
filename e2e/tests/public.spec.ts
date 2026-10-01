import { expect, test } from '@playwright/test';
import { expectNoBrowserStorage } from '../support/helpers';

test('home page searches the catalogue', async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder(/Search by brand name or generic name/).fill('E2E Paracetamol');
  await expect(page.getByText('E2E Paracetamol 500').first()).toBeVisible();
  await expectNoBrowserStorage(page);
});

test('product page shows the declarations the law asks for (C-17, C-35)', async ({ page }) => {
  await page.goto(`/shop/${process.env.E2E_PRODUCT_ID}`);
  await expect(page.getByRole('heading', { name: /E2E Paracetamol 500/ })).toBeVisible();
  await expect(page.getByText(/E2E Pharma Ltd/).first()).toBeVisible();
  await expect(page.getByText(/MRP/).first()).toBeVisible();
});

test('policies are listed and open', async ({ page }) => {
  await page.goto('/policies');
  await expect(page.getByRole('heading').first()).toBeVisible();
});

test('unknown pages say so', async ({ page }) => {
  const res = await page.goto('/no-such-page');
  expect(res?.status()).toBe(404);
});
