// Sprint 44 — a doctor buying for the clinic (FDA Maharashtra circular Drug/Wholesalers Memo./16/2026/1;
// Drugs Rules r.65(9)(b)): the registration status, a written order signed in the app before the
// order can be placed, and staff's register of sales to doctors.
import { expect, test } from '@playwright/test';
import { addToCart, signIn } from '../support/helpers';
import { call, people } from '../support/data';

test('a doctor signs a written order for the cart before placing the order', async ({ page }) => {
  const token = (await call('POST', '/auth/login', { mobile: people.doctor.mobile, password: people.doctor.password })).json.data?.access_token;
  await call('DELETE', '/cart', undefined, token);
  await signIn(page, 'doctor');
  await page.goto('/account');
  await expect(page.getByTestId('registration-status')).toContainText('Medical council registration: Verified');
  await page.goto(`/shop/${process.env.E2E_PRODUCT_ID}`);
  await addToCart(page);
  await page.goto('/checkout');
  await page.getByRole('button', { name: /Review order/ }).click();
  await expect(page.getByRole('heading', { name: 'Signed written order needed' })).toBeVisible();
  await expect(page.getByTestId('requisition-text')).toContainText('WRITTEN ORDER FOR DRUGS (Drugs Rules 1945, r.65(9)(b))');
  await expect(page.getByTestId('requisition-text')).toContainText('MMC-E2E-44');
  await page.getByRole('checkbox', { name: /These medicines are for dispensing to my own patients/ }).check();
  await expect(page.getByRole('button', { name: /Place order/ })).toBeDisabled();    // no written order yet
  await page.getByLabel(/Your name as on the medical council register/).fill('Dr Meera Joshi');
  await page.getByLabel(/Your Dawabag password/).fill(people.doctor.password);
  await page.getByRole('checkbox', { name: /I sign this written order/ }).check();
  await page.getByRole('button', { name: 'Sign written order' }).click();
  await expect(page.getByTestId('written-order-chosen')).toContainText('Signed written order attached');
  await page.getByRole('button', { name: /Place order/ }).click();
  await expect(page.getByRole('heading', { name: 'Payment' })).toBeVisible();
  const orders = (await call('GET', '/orders/my', undefined, token)).json.data.orders;
  const detail = (await call('GET', `/orders/${orders[0].id}`, undefined, token)).json.data;
  expect(detail.written_orders).toHaveLength(1);
  expect(detail.written_orders[0].kind).toBe('in_app');
});

test('staff see doctor registrations and the register of sales to doctors', async ({ page }) => {
  await signIn(page, 'admin');
  await page.goto('/admin/practitioners?');
  await expect(page.getByRole('heading', { name: 'Doctor and institution registrations' })).toBeVisible();
  await page.getByRole('button', { name: 'All' }).click();
  await expect(page.getByTestId('practitioner-row').filter({ hasText: 'MMC-E2E-44' })).toContainText('Verified');
  await page.goto('/admin/practitioner-sales');
  await expect(page.getByRole('heading', { name: 'Sales to doctors and medical institutions' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Download CSV/ })).toBeEnabled();
});
