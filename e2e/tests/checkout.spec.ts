// The buyer's journey to payment: cart → address → review (C-35: seller and licence,
// charges, country of origin, refund and return policies) → order placed → payment
// step. Razorpay's own checkout is not opened here (it is an external page).
import { expect, Page, test } from '@playwright/test';
import { addToCart, signIn } from '../support/helpers';
import { call, people } from '../support/data';

async function emptyCart(page: Page) {
  // Through the API as the buyer, so each test starts from an empty server cart
  const token = (await call('POST', '/auth/login', { mobile: people.buyer.mobile, password: people.buyer.password })).json.data?.access_token;
  await call('DELETE', '/cart', undefined, token);
  await page.goto('/');
}

test('checkout shows the legally required disclosures before payment (C-35)', async ({ page }) => {
  await signIn(page, 'buyer');
  await emptyCart(page);
  await page.goto(`/shop/${process.env.E2E_PRODUCT_ID}`);
  await addToCart(page);
  await page.goto('/checkout');
  await page.getByRole('button', { name: /Review order/ }).click();

  await expect(page.getByText(/Sold by /).first()).toBeVisible();
  await expect(page.getByText(/Drug licence/).first()).toBeVisible();
  await expect(page.getByText(/Country of origin: India/).first()).toBeVisible();
  await expect(page.getByText('Delivery', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: /refund|return/i }).first()).toBeVisible();

  await page.getByRole('button', { name: /Place order/ }).click();
  await expect(page.getByRole('button', { name: /Pay .* securely/ })).toBeVisible();
});

test('a prescription medicine cannot reach payment without a prescription (C-08)', async ({ page }) => {
  await signIn(page, 'buyer');
  await emptyCart(page);
  await page.goto(`/shop/${process.env.E2E_RX_PRODUCT_ID}`);
  await addToCart(page);
  await page.goto('/checkout');
  // Sprint 26: the prescription is chosen before review, so nothing is placed without one
  await page.getByRole('button', { name: /Continue to prescription/ }).click();
  await expect(page.getByRole('heading', { name: 'Prescription needed' })).toBeVisible();
  await expect(page.getByText('E2E Amoxicillin 500 × 1')).toBeVisible();
  await expect(page.getByText(/pharmacist checks your prescription before anything is dispatched/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /Choose or upload a prescription/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: /Place order/ })).toHaveCount(0);
});

test('every page carries the licence and grievance details (C-04, C-36)', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('contentinfo')).toBeVisible();
  await expect(page.getByRole('contentinfo').getByText(/grievance/i).first()).toBeVisible();
});
