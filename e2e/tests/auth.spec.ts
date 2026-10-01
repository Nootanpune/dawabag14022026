import { expect, test } from '@playwright/test';
import { expectNoBrowserStorage, signIn } from '../support/helpers';
import { people } from '../support/data';

test('a wrong password is refused with a message', async ({ page }) => {
  await page.goto('/auth/login');
  await page.getByPlaceholder('9876543210').fill(people.buyer.mobile);
  await page.getByPlaceholder('••••••••').fill('wrong-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText(/invalid|incorrect|wrong/i).first()).toBeVisible();
  await expect(page).toHaveURL(/\/auth\/login/);
});

test('a buyer signs in; the session is an httpOnly cookie, nothing in browser storage', async ({ page, context }) => {
  await signIn(page, 'buyer');
  await expect(page).toHaveURL(/\/$/);
  const cookies = await context.cookies();
  const session = cookies.filter((c) => /^dwb_/.test(c.name));
  expect(session.length).toBeGreaterThan(0);
  expect(session.every((c) => c.httpOnly)).toBe(true);
  await expectNoBrowserStorage(page);
});
