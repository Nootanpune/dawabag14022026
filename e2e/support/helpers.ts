import { expect, Page } from '@playwright/test';
import { people } from './data';

export async function signIn(page: Page, who: keyof typeof people) {
  await page.goto('/auth/login');
  await page.getByPlaceholder('9876543210').fill(people[who].mobile);
  await page.getByPlaceholder('••••••••').fill(people[who].password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).not.toHaveURL(/\/auth\/login/);
}

// Standing rule: the server is the single source of truth — the website keeps
// nothing in the browser's storage (sessions use an httpOnly cookie)
export async function expectNoBrowserStorage(page: Page) {
  const used = await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }));
  expect(used).toEqual({ local: 0, session: 0 });
}

// Adds the product on the current page to the server cart and waits for the
// server to confirm it — navigating on straight after the click can cancel the
// request on a slow machine and leave the cart empty
export async function addToCart(page: Page) {
  await Promise.all([
    page.waitForResponse((r) => /\/cart\/items\//.test(r.url()) && r.request().method() === 'PUT' && r.ok()),
    page.getByRole('button', { name: 'Add to cart' }).first().click(),
  ]);
}
