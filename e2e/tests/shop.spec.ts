// Sprint 25 — shop like Amazon: search from any page, "Add more medicines" in the
// cart, and a prescription uploaded on its own. The cart and the prescriptions are
// the server's (standing rule); nothing is kept in the browser.
import { expect, Page, test } from '@playwright/test';
import { expectNoBrowserStorage, signIn } from '../support/helpers';
import { call, people } from '../support/data';

async function emptyCart() {
  const token = (await call('POST', '/auth/login', { mobile: people.buyer.mobile, password: people.buyer.password })).json.data?.access_token;
  await call('DELETE', '/cart', undefined, token);
}

/** Types into a search combobox and presses the quick "Add" on the suggestion, waiting for the server cart. */
async function addFromSuggestions(page: Page, box: string, text: string, product: string) {
  await page.getByRole('combobox', { name: box }).fill(text);
  const option = page.getByRole('option', { name: new RegExp(product) });
  await expect(option).toBeVisible();
  await Promise.all([
    page.waitForResponse((r) => /\/cart\/items\//.test(r.url()) && r.request().method() === 'PUT' && r.ok()),
    option.getByRole('button', { name: `Add ${product} to cart` }).click(),
  ]);
}

test('the header search works from the cart: finds a medicine and adds it', async ({ page }) => {
  await signIn(page, 'buyer');
  await emptyCart();
  await page.goto('/cart');
  await expect(page.getByRole('heading', { name: 'Your cart is empty' })).toBeVisible();
  await addFromSuggestions(page, 'Search medicines', 'E2E Para', 'E2E Paracetamol 500');
  await expect(page.getByRole('heading', { name: /Cart \(1 items\)/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'E2E Paracetamol 500' })).toBeVisible();
  await expectNoBrowserStorage(page);
});

test('the header search: arrow keys and Enter open a medicine, Escape closes the list', async ({ page }) => {
  await page.goto('/policies');
  const box = page.getByRole('combobox', { name: 'Search medicines' });
  await box.fill('E2E Paracetamol');
  await expect(page.getByRole('option', { name: /E2E Paracetamol 500/ })).toBeVisible();
  await box.press('Escape');
  await expect(box).toHaveAttribute('aria-expanded', 'false');
  await box.press('ArrowDown');
  await box.press('ArrowDown');
  await expect(box).toHaveAttribute('aria-activedescendant', /header-search-opt-0/);
  await box.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/shop/${process.env.E2E_PRODUCT_ID}`));
});

test('"Add more medicines" in the cart adds to the server cart; a prescription medicine asks for one', async ({ page }) => {
  await signIn(page, 'buyer');
  await emptyCart();
  await page.goto('/cart');
  await addFromSuggestions(page, 'Add more medicines', 'E2E Para', 'E2E Paracetamol 500');
  await expect(page.getByRole('heading', { name: /Cart \(1 items\)/ })).toBeVisible();
  await addFromSuggestions(page, 'Add more medicines', 'E2E Amox', 'E2E Amoxicillin 500');
  await expect(page.getByRole('heading', { name: /Cart \(2 items\)/ })).toBeVisible();
  const notice = page.getByTestId('cart-rx-notice');
  await expect(notice).toContainText('Prescription required');
  await expect(notice.getByRole('link')).toHaveAttribute('href', '/prescriptions');
  await emptyCart();
});

test('signed out, the prescriptions page asks to sign in and comes back after', async ({ page }) => {
  await page.goto('/prescriptions');
  await expect(page).toHaveURL(/\/auth\/login\?next=%2Fprescriptions/);
  await page.getByPlaceholder('9876543210').fill(people.buyer.mobile);
  await page.getByPlaceholder('••••••••').fill(people.buyer.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/prescriptions$/);
  await expect(page.getByRole('heading', { name: 'Prescriptions', level: 1 })).toBeVisible();
});

// Needs the object store: the fake one (backend/test/fakes, started by global-setup) with the
// API run with AWS_S3_BUCKET=dawabag-fake-bucket and S3_ENDPOINT=http://127.0.0.1:$FAKE_PROVIDERS_PORT
test('a prescription is uploaded on its own, listed, and then offered in the cart', async ({ page }) => {
  test.skip(!process.env.S3_ENDPOINT, 'no object store for this run (set S3_ENDPOINT and AWS_S3_BUCKET as in e2e/README.md)');
  await signIn(page, 'buyer');
  await page.goto('/prescriptions');
  const before = await page.getByTestId('prescription-row').count();
  await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/prescriptions/upload') && r.status() === 201),
    page.getByLabel('Prescription file').setInputFiles({ name: 'prescription.png', mimeType: 'image/png',
      buffer: Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000100e221bc330000000049454e44ae426082', 'hex') }),
  ]);
  await expect(page.getByRole('heading', { name: 'Prescription uploaded' })).toBeVisible();
  await expect(page.getByText('Now add the medicines from your prescription to your cart.')).toBeVisible();
  await expect(page.getByTestId('prescription-row')).toHaveCount(before + 1);
  await expect(page.getByTestId('prescription-row').first()).toContainText('Uploaded — not checked yet');
  await expectNoBrowserStorage(page);

  // The cart with a prescription medicine now says one is ready for checkout
  await emptyCart();
  await page.goto(`/shop/${process.env.E2E_RX_PRODUCT_ID}`);
  await Promise.all([
    page.waitForResponse((r) => /\/cart\/items\//.test(r.url()) && r.request().method() === 'PUT' && r.ok()),
    page.getByRole('button', { name: 'Add to cart' }).first().click(),
  ]);
  await page.goto('/cart');
  await expect(page.getByTestId('cart-rx-notice')).toContainText(/You have \d+ uploaded prescriptions?/);
  await emptyCart();
});
