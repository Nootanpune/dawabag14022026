// Sprint 43 — fixes from the quality sweep (docs/reviews/qa-sweep-sprint43.md) that a
// customer or the owner would notice: no error noise for a visitor, the same order status
// on "My orders" and the order page, plain words instead of raw values, phone layout.
import { expect, test } from '@playwright/test';
import { signIn } from '../support/helpers';
import { call, db, people, PIN } from '../support/data';

test('a visitor who is not signed in gets no error from the session check', async ({ page }) => {
  const failed: string[] = [];
  page.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });
  // Script errors (not resource loads: a shared test database may hold pack photos of another run's object store)
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/');
  await expect(page.getByRole('combobox', { name: 'Search medicines' })).toBeVisible();
  await page.goto(`/shop/${process.env.E2E_PRODUCT_ID}`);
  await expect(page.getByRole('heading', { name: /E2E Paracetamol 500/ })).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(failed, failed.join('\n')).toEqual([]);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('a policy not yet published reads as "being prepared", not as an error', async ({ page, request }) => {
  const body = await (await request.get(`${process.env.API_URL || 'http://localhost:4000'}/api/v1/legal/policies`)).json();
  const published: { doc_key: string }[] = body.data?.policies ?? [];
  const missing = ['terms', 'privacy', 'shipping', 'cancellation', 'refund'].find((k) => !published.some((p) => p.doc_key === k));
  test.skip(!missing, 'every policy is published on this server');
  await page.goto(`/policies/${missing}`);
  await expect(page.getByText('This policy is being prepared and will appear here once it is published.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'licences and grievance redressal' })).toHaveAttribute('href', '/legal');
});

test('"My orders" shows the same status as the order page, and each order is a link', async ({ page }) => {
  const t = (await call('POST', '/auth/login', { mobile: people.buyer.mobile, password: people.buyer.password })).json.data?.access_token;
  const addr = (await call('GET', '/users/me/addresses', undefined, t)).json.data[0];
  const o = (await call('POST', '/orders', { address_id: addr.id, pincode: PIN, items: [{ product_id: process.env.E2E_PRODUCT_ID, quantity: 1 }] }, t)).json.data.order;
  const c = db();
  await c.connect();
  try { await c.query(`UPDATE orders SET status = 'packing' WHERE id = $1`, [o.id]); } finally { await c.end(); }
  await signIn(page, 'buyer');
  await page.goto('/orders');
  const card = page.getByRole('link', { name: new RegExp(o.order_number) });
  await expect(card).toContainText('Pharmacist check');      // not "Being prepared" while the pharmacist has not released it
  await card.click();
  await expect(page).toHaveURL(new RegExp(`/orders/${o.id}`));
  await expect(page.getByText('Pharmacist check').first()).toBeVisible();
});

test('admin settings show plain words, not raw values', async ({ page }) => {
  await signIn(page, 'admin');
  await page.goto('/admin/settings');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(page.getByText('Free delivery from')).toBeVisible();
  const text = await page.locator('main').innerText();
  expect(text).not.toMatch(/\{"/);
  expect(text).not.toMatch(/null = off/);
});

test.describe('phone width', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('the two-step sign-in overview does not widen the page', async ({ page }) => {
    await signIn(page, 'admin');
    await page.goto('/admin/two-factor');
    await expect(page.getByRole('heading', { name: 'Two-step sign-in' })).toBeVisible();
    await page.waitForLoadState('networkidle');
    const { sw, w } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: document.documentElement.clientWidth }));
    expect(sw).toBeLessThanOrEqual(w + 1);
  });
});
