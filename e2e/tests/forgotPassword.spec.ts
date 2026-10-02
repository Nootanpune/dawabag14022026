// Sprint 35 — the restyled sign-in: sign in with a one-time code, and "Forgot password?"
// (code to the registered mobile → code + new password twice → signed in, C-44).
import { expect, test } from '@playwright/test';
import { call, redis } from '../support/data';

const consent = { accept_privacy_notice: true, age_confirmed: true };
const person = { customer_type: 'customer', full_name: 'E2E Forgetful', mobile: '9000001961', password: 'Passw0rd!', ...consent };

test.beforeAll(async () => {
  const r = redis();
  try {
    await call('POST', '/auth/register', person);
    const otp = await r.get(`otp:${person.mobile}`);
    if (otp) await call('POST', '/auth/verify-otp', { mobile: person.mobile, otp });
  } finally { r.disconnect(); }
});

async function latestOtp() {
  const r = redis();
  try {
    for (let i = 0; i < 20; i++) { const v = await r.get(`otp:${person.mobile}`); if (v) return v; await new Promise((x) => setTimeout(x, 250)); }
    throw new Error('no code');
  } finally { r.disconnect(); }
}

test('the sign-in page: DAWA BAG logo with tagline, labels above rounded fields', async ({ page }) => {
  await page.goto('/auth/login');
  await expect(page.getByRole('link', { name: 'DAWA BAG home' })).toBeVisible();
  await expect(page.getByLabel('Mobile number')).toBeVisible();
  await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Forgot password?' })).toBeVisible();
});

test('sign in with a one-time code', async ({ page }) => {
  await page.goto('/auth/login');
  await page.getByRole('button', { name: 'One-time code' }).click();
  await page.getByLabel('Mobile number').fill(person.mobile);
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByLabel('Code').fill(await latestOtp());
  await page.getByRole('button', { name: 'Verify and sign in' }).click();
  await expect(page).not.toHaveURL(/\/auth\/login/);
});

test('forgot password: a code, then a new password twice, then signed in', async ({ page }) => {
  await page.goto('/auth/login');
  await page.getByRole('link', { name: 'Forgot password?' }).click();
  await expect(page.getByRole('heading', { name: 'Forgot password' })).toBeVisible();
  await page.getByLabel('Mobile number').fill(person.mobile);
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect(page.getByText(`If +91 ${person.mobile} has an account`)).toBeVisible();
  const otp = await latestOtp();
  await page.getByLabel('Code').fill(otp);
  await page.getByLabel('New password', { exact: true }).fill('NewPassw0rd9');
  await page.getByLabel('New password again').fill('NewPassw0rd8');
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByText('The two passwords are not the same')).toBeVisible();
  await page.getByLabel('New password again').fill('NewPassw0rd9');
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByText('Password changed')).toBeVisible();
  await expect(page).not.toHaveURL(/\/auth\//, { timeout: 10_000 });
  const login = await call('POST', '/auth/login', { mobile: person.mobile, password: 'NewPassw0rd9' });
  expect(login.status).toBe(200);
});
