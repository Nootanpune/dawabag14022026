// Sprint 28 — Dawabag's admin adds a partner pharmacy (business, GST, four drug
// licences, two pharmacists, address, two logins with temporary passwords shown
// once), and the partner's first sign-in forces a new password before anything
// else, then Upload stock opens. Desktop and phone.
// Data (made up): logins 900000193x, vendors 'E2E S28 …', GSTINs with a correct
// check character; removed by the global cleanup (users 90000019%, vendors 'E2E %').
import { expect, test, type Page } from '@playwright/test';
import { db } from '../support/data';
import { expectNoBrowserStorage, signIn } from '../support/helpers';

test.describe.configure({ mode: 'serial' });

const plusDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const NEW_PASSWORD = 'E2E-own-pass-28';
let p: { tag: string; gstin: string; prefix: string; logins: [string, string]; name: string };
let temporary = '';

test.beforeAll(async ({}, info) => {
  const phone = info.project.name === 'phone';
  p = phone
    ? { tag: 'P', gstin: '27EEEEE1928P1ZS', prefix: 'E2P', logins: ['9000001933', '9000001934'], name: 'E2E S28 Phone Pharma' }
    : { tag: 'D', gstin: '27EEEEE1928D1ZH', prefix: 'E2D', logins: ['9000001931', '9000001932'], name: 'E2E S28 Desk Pharma' };
  const c = db();
  await c.connect();
  try {
    await c.query("SET dawabag.maintenance = 'on'");
    const old = (await c.query(`SELECT id FROM vendors WHERE name = $1`, [p.name])).rows.map((x) => x.id);
    const users = (await c.query(`SELECT id FROM users WHERE mobile = ANY($1)`, [p.logins])).rows.map((x) => x.id);
    await c.query('DELETE FROM vendor_users WHERE vendor_id = ANY($1) OR user_id = ANY($2)', [old, users]);
    await c.query('UPDATE audit_logs SET performed_by = NULL WHERE performed_by = ANY($1)', [users]);
    for (const t of ['audit_logs', 'user_profiles', 'notifications']) await c.query(`DELETE FROM ${t} WHERE user_id = ANY($1)`, [users]);
    await c.query('DELETE FROM users WHERE id = ANY($1)', [users]);
    await c.query('DELETE FROM vendors WHERE id = ANY($1)', [old]);
  } finally { await c.end(); }
});

// Sprint 30: licences are repeatable rows (form, number, valid till); row 1 starts as Form 20
async function fillLicence(page: Page, n: number, form: string, number: string, validTill: string) {
  if (n > 1) await page.getByRole('button', { name: 'Add another licence' }).click();
  await page.getByLabel(`Licence ${n} — form`, { exact: true }).selectOption(form);
  await page.getByLabel(`Licence ${n} — number`, { exact: true }).fill(number);
  await page.getByLabel(`Licence ${n} — valid till`, { exact: true }).fill(validTill);
}

test('the admin adds a partner with four licences, two pharmacists and two logins', async ({ page }) => {
  await signIn(page, 'admin');
  await page.goto('/admin/partners');
  await expect(page.getByRole('heading', { name: 'Partners', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Add partner' }).click();
  await expect(page.getByRole('heading', { name: 'Add partner' })).toBeVisible();

  // Business
  await page.getByLabel('Legal name').fill(p.name);
  await page.getByLabel('Shop / trade name (if different)').fill(`${p.name} Shop`);
  await page.getByLabel('Contact person').fill('E2E Owner');
  await page.getByLabel('Contact mobile').fill('9000001939');
  await page.getByLabel('Invoice prefix').fill(p.prefix);
  // GST: a typing mistake is pointed out at once
  const gstin = page.getByLabel('GSTIN');
  await gstin.fill(p.gstin.slice(0, 14) + (p.gstin[14] === 'A' ? 'B' : 'A'));
  await expect(page.getByText('The last character does not match — check for a typing mistake')).toBeVisible();
  await gstin.fill(p.gstin);
  await expect(page.getByText('The last character does not match — check for a typing mistake')).toBeHidden();

  // Drug licences: all four forms
  await fillLicence(page, 1, 'dl20', `E2E-${p.tag}-20-01`, plusDays(800));
  await fillLicence(page, 2, 'dl21', `E2E-${p.tag}-21-02`, plusDays(800));
  await fillLicence(page, 3, 'dl20b', `E2E-${p.tag}-20B-03`, plusDays(500));
  await fillLicence(page, 4, 'dl21b', `E2E-${p.tag}-21B-04`, plusDays(500));

  // Pharmacists: two rows
  await page.getByLabel('Pharmacist 1 — full name').fill('E2E Pharmacist One');
  await page.getByLabel('Pharmacist 1 — registration number').fill(`E2E-${p.tag}-REG-1`);
  await page.getByRole('button', { name: 'Add another pharmacist' }).click();
  await page.getByLabel('Pharmacist 2 — full name').fill('E2E Pharmacist Two');
  await page.getByLabel('Pharmacist 2 — registration number').fill(`E2E-${p.tag}-REG-2`);

  // Address
  await page.getByLabel('Address line 1').fill('28 Test Market Road');
  await page.getByLabel('City').fill('Pune');
  await page.getByLabel('State').fill('Maharashtra');
  await page.getByLabel('PIN code').fill('411001');

  // Logins: two mobiles, each with a temporary password made in the browser
  await expect(page.getByText('they must change it at first login')).toBeVisible();
  await page.getByLabel('Login 1 — mobile').fill(p.logins[0]);
  await page.getByLabel('Login 1 — person\'s name').fill('E2E Login One');
  await page.getByRole('button', { name: 'Add another login' }).click();
  await page.getByLabel('Login 2 — mobile').fill(p.logins[1]);
  await expect(page.getByRole('button', { name: 'Copy temporary password for login 1' })).toBeVisible();

  await page.getByRole('button', { name: 'Add partner', exact: true }).click();
  await expect(page.getByRole('heading', { name: `${p.name} added` })).toBeVisible();
  await expect(page.getByText('Temporary passwords — shown only now')).toBeVisible();
  const shown = page.getByTestId('temporary-password');
  await expect(shown).toHaveCount(2);
  temporary = (await shown.first().textContent())?.trim() ?? '';
  expect(temporary).toMatch(/^[A-Za-z]{4}-\d{4}-[A-Za-z]{4}$/);
  await expectNoBrowserStorage(page);

  // Detail: what it may sell, logins waiting for their own password
  await page.getByRole('link', { name: 'Open the partner' }).click();
  await expect(page.getByText('patients (retail licence) and licensed trade buyers (wholesale licence)')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Partner drug licences' }).getByTestId('licence-item')).toHaveCount(4);
  await expect(page.getByText('Has not yet changed the temporary password')).toHaveCount(2);
  await expect(page.getByRole('heading', { name: 'Edit details' })).toBeVisible();
});

test('the partner must choose a new password at first sign-in, then can upload stock', async ({ page }) => {
  expect(temporary, 'the previous test created the login').not.toBe('');
  await page.goto('/auth/login');
  await page.getByPlaceholder('9876543210').fill(p.logins[0]);
  await page.getByPlaceholder('••••••••').fill(temporary);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/auth\/change-password$/);
  await expect(page.getByRole('heading', { name: 'Choose your own password' })).toBeVisible();

  // Nothing else opens until it is changed
  await page.goto('/partner/stock-import');
  await expect(page).toHaveURL(/\/auth\/change-password$/);

  await page.getByLabel('Current password (the temporary one you were given)').fill(temporary);
  await page.getByLabel('New password', { exact: true }).fill('short1');
  await page.getByLabel('New password again').fill('short1');
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.getByText('Password must be at least 8 characters')).toBeVisible();

  await page.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel('New password again').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page).toHaveURL(/\/partner$/);
  await expectNoBrowserStorage(page);

  await page.goto('/partner/stock-import');
  await expect(page.getByRole('heading', { name: 'Upload stock' })).toBeVisible();

  // The new password works from a fresh sign-in and asks for nothing more
  await page.context().clearCookies();
  await page.goto('/auth/login');
  await page.getByPlaceholder('9876543210').fill(p.logins[0]);
  await page.getByPlaceholder('••••••••').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/partner$/);
});
