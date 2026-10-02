// Sprint 26 — the customer journey the owner walked on the trial: the home search
// shows suggestions with Add, Add turns into − qty + (server cart), the product page
// lets you choose how many, Back works on every page, the chosen prescription is
// shown on review and payment (C-08), and payment is Razorpay, the trial's demo
// payment, or a plain "not available" — never a raw error.
import { expect, Page, test } from '@playwright/test';
import { expectNoBrowserStorage, signIn } from '../support/helpers';
import { API, call, people } from '../support/data';

const PARA = 'E2E Paracetamol 500';
const AMOX = 'E2E Amoxicillin 500';

async function token() {
  return (await call('POST', '/auth/login', { mobile: people.buyer.mobile, password: people.buyer.password })).json.data?.access_token;
}
async function emptyCart() { await call('DELETE', '/cart', undefined, await token()); }
async function serverQty(productId: string | undefined) {
  const cart = (await call('GET', '/cart', undefined, await token())).json.data;
  return cart.items.find((i: any) => i.product_id === productId)?.quantity ?? 0;
}
const cartPut = (page: Page) => page.waitForResponse((r) => /\/cart\/items\//.test(r.url()) && r.request().method() === 'PUT' && r.ok());

test('home search: suggestions appear as you type, Add then − qty + changes the server cart', async ({ page }) => {
  await signIn(page, 'buyer');
  await emptyCart();
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Search medicines' }).fill('E2E Para');
  const option = page.getByRole('option', { name: new RegExp(PARA) });
  await expect(option).toBeVisible();
  await Promise.all([cartPut(page), option.getByRole('button', { name: `Add ${PARA} to cart` }).click()]);
  await expect(option.getByLabel('1 in cart')).toBeVisible();
  await Promise.all([cartPut(page), option.getByRole('button', { name: `Increase quantity of ${PARA}` }).click()]);
  await expect(option.getByLabel('2 in cart')).toBeVisible();
  expect(await serverQty(process.env.E2E_PRODUCT_ID)).toBe(2);
  await expectNoBrowserStorage(page);
});

test('result cards and cart lines have a − qty + stepper; − at one removes the line', async ({ page }) => {
  await signIn(page, 'buyer');
  await emptyCart();
  await page.goto('/search?q=E2E%20Paracetamol');
  await Promise.all([cartPut(page), page.getByRole('button', { name: `Add ${PARA} to cart` }).first().click()]);
  await Promise.all([cartPut(page), page.getByRole('button', { name: `Increase quantity of ${PARA}` }).first().click()]);
  expect(await serverQty(process.env.E2E_PRODUCT_ID)).toBe(2);
  await page.goto('/cart');
  await expect(page.getByRole('group', { name: `Quantity of ${PARA}` })).toContainText('2');
  await Promise.all([cartPut(page), page.getByRole('button', { name: `Decrease quantity of ${PARA}` }).click()]);
  await Promise.all([cartPut(page), page.getByRole('button', { name: `Remove ${PARA} from cart` }).first().click()]);
  await expect(page.getByRole('heading', { name: 'Your cart is empty' })).toBeVisible();
});

test('product page: choose the quantity before adding, the limit is stated plainly', async ({ page }) => {
  await signIn(page, 'buyer');
  await emptyCart();
  await page.goto(`/shop/${process.env.E2E_PRODUCT_ID}`);
  await expect(page.getByText('Up to 10 per order.')).toBeVisible();
  await page.getByRole('button', { name: 'One more' }).click();
  await page.getByRole('button', { name: 'One more' }).click();
  await Promise.all([cartPut(page), page.getByRole('button', { name: /^Add 3 to cart/ }).click()]);
  await expect(page.getByText('In your cart')).toBeVisible();
  expect(await serverQty(process.env.E2E_PRODUCT_ID)).toBe(3);
  await expect(page.getByRole('link', { name: 'Go to cart' })).toBeVisible();
});

test('the header has Back on every page but home; it returns to the previous page, or a parent', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Back', exact: true })).toHaveCount(0);
  await page.goto('/search?q=E2E%20Paracetamol');
  await page.getByRole('link', { name: PARA }).first().click();
  await expect(page).toHaveURL(/\/shop\//);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page).toHaveURL(/\/search\?q=E2E/);
  // Opened directly (no earlier page in this tab): Back goes to a sensible parent
  await page.goto(`/shop/${process.env.E2E_PRODUCT_ID}`);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page).toHaveURL(/\/search$/);
});

test('breadcrumbs on the product page (laptop)', async ({ page }) => {
  await page.goto(`/shop/${process.env.E2E_PRODUCT_ID}`);
  const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
  await expect(crumbs.getByRole('link', { name: 'Home' })).toBeVisible();
  await expect(crumbs.getByText(PARA)).toBeVisible();
});

/** Mocks how this server takes payment, so each mode can be shown with the usual API. */
async function mockPayments(page: Page, mode: 'demo' | 'unavailable', demoPaid = true) {
  await page.route('**/payments/options', (r) => r.fulfill({ json: { success: true,
    data: { mode, methods: mode === 'demo' ? ['upi', 'card', 'netbanking', 'wallet'] : [], cash_on_delivery: false } } }));
  await page.route('**/payments/demo', (r) => r.fulfill({ json: { success: true, data: { paid: demoPaid, demo: true, status: demoPaid ? 'packing' : 'payment_failed' } } }));
}

async function placeOtcOrder(page: Page) {
  await emptyCart();
  await call('PUT', `/cart/items/${process.env.E2E_PRODUCT_ID}`, { quantity: 1 }, await token());
  await page.goto('/checkout');
  await page.getByRole('button', { name: /Review order/ }).click();
  await page.getByRole('button', { name: /Place order/ }).click();
}

test('trial demo payment: tiles, "Simulate failure" says so plainly, "Pay (demo)" confirms the order', async ({ page }) => {
  await signIn(page, 'buyer');
  await mockPayments(page, 'demo', false);
  await placeOtcOrder(page);
  await expect(page.getByText('Demo payment — no money moves.')).toBeVisible();
  for (const m of ['UPI', 'Card', 'Netbanking', 'Wallet']) await expect(page.getByRole('radio', { name: new RegExp(m) })).toBeVisible();
  await page.getByRole('radio', { name: /Card/ }).click();
  await page.getByRole('button', { name: 'Simulate failure' }).click();
  await expect(page.getByText('Demo payment failed (simulated). No money was taken.')).toBeVisible();
  await page.unroute('**/payments/demo');
  await mockPayments(page, 'demo', true);
  await page.getByRole('button', { name: /Pay .*\(demo\)/ }).click();
  await expect(page.getByRole('heading', { name: 'Order confirmed!' })).toBeVisible();
  await expect(page.getByText('Demo payment — no money moved')).toBeVisible();
});

test('no way to pay online: a plain sentence, never an error code', async ({ page }) => {
  await signIn(page, 'buyer');
  await mockPayments(page, 'unavailable');
  await placeOtcOrder(page);
  await expect(page.getByText('Online payment is not available right now.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Pay / })).toHaveCount(0);
});

test('"Pay securely" opens Razorpay Checkout with this order; closing it is explained plainly', async ({ page }) => {
  test.skip(!process.env.S3_ENDPOINT, 'the fake Razorpay runs only with the fake providers (S3_ENDPOINT, e2e/README.md)');
  await signIn(page, 'buyer');
  // Checkout's script is replaced by a stub that records what it was opened with, then is closed
  await page.route('https://checkout.razorpay.com/v1/checkout.js', (r) => r.fulfill({ contentType: 'application/javascript',
    body: `window.Razorpay = function (o) { window.__rzpOpened = { key: o.key, order_id: o.order_id, amount: o.amount };
      this.on = function () {}; this.open = function () { setTimeout(function () { o.modal.ondismiss(); }, 50); }; };` }));
  await placeOtcOrder(page);
  await page.getByRole('button', { name: /Pay .* securely/ }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Payment window closed. Nothing was charged.' })).toBeVisible();
  const opened = await page.evaluate(() => (window as any).__rzpOpened);
  expect(opened.key).toMatch(/^rzp_test_/);
  expect(opened.order_id).toBeTruthy();
  expect(opened.amount).toBeGreaterThan(0);
});

test('the chosen prescription is named on review and payment, with what happens if it is rejected (C-08)', async ({ page }) => {
  test.skip(!process.env.S3_ENDPOINT, 'no object store for this run (set S3_ENDPOINT and AWS_S3_BUCKET as in e2e/README.md)');
  const t = await token();
  // A prescription uploaded on its own (as on /prescriptions), through the API
  const form = new FormData();
  form.append('prescription', new Blob([Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64')], { type: 'image/jpeg' }), 'rx.jpg');
  const up = await fetch(`${API}/prescriptions/upload`, { method: 'POST', headers: { Authorization: `Bearer ${t}` }, body: form });
  expect(up.status).toBe(201);
  await signIn(page, 'buyer');
  await emptyCart();
  await call('PUT', `/cart/items/${process.env.E2E_RX_PRODUCT_ID}`, { quantity: 1 }, t);
  await page.goto('/checkout');
  await page.getByRole('button', { name: /Continue to prescription/ }).click();
  await expect(page.getByText(`${AMOX} × 1`)).toBeVisible();
  await page.getByRole('radio', { name: /Prescription photo/ }).first().click();
  await expect(page.getByText('Chosen')).toBeVisible();
  await page.getByRole('button', { name: /Continue to review/ }).click();
  await expect(page.getByTestId('rx-attached')).toContainText(/Prescription \(photo\) uploaded .* ✓/);
  await expect(page.getByText(/cancel the order and get a full refund/)).toBeVisible();
  await page.getByRole('button', { name: /Place order/ }).click();
  await expect(page.getByRole('heading', { name: 'Payment' })).toBeVisible();
  await expect(page.getByTestId('rx-attached')).toContainText('our pharmacist checks it before dispatch');
});
