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
