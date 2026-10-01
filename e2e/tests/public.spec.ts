import { expect, test } from '@playwright/test';
import { expectNoBrowserStorage } from '../support/helpers';

test('home page searches the catalogue', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('searchbox', { name: 'Search medicines' }).fill('E2E Paracetamol');
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

test('the footer licence, pharmacist and grievance details are reachable (C-04, C-36)', async ({ page }, info) => {
  await page.goto('/');
  const footer = page.getByRole('contentinfo');
  // Phones show a one-line summary; the full details open from the footer
  if (info.project.name === 'phone') {
    await footer.getByText('Licences, pharmacist & grievance officer').click();
  }
  await expect(footer.getByText('Grievance officer', { exact: true })).toBeVisible();
  await expect(footer.getByText('Pharmacist in charge', { exact: true })).toBeVisible();
  await expect(footer.getByText('Drug licences', { exact: true })).toBeVisible();
});

test('pages refuse to be framed by other sites and send basic security headers', async ({ request }) => {
  const res = await request.get('/');
  const h = res.headers();
  expect(h['x-frame-options']).toBe('DENY');
  expect(h['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(h['x-content-type-options']).toBe('nosniff');
});
