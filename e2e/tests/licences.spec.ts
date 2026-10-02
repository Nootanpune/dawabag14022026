// Sprint 30 — drug licences for every party, in the browser (desktop and phone):
//   1. the admin adds a supplier / company with manufacturing Form 25 and wholesale 20B,
//      and the supplier list shows both with their valid-till dates;
//   2. a retailer (signed up with Forms 20 and 21) sees "Your drug licences", sends a
//      renewed Form 21 that waits for the check;
//   3. the admin reviews the retailer's KYC: every licence listed, checks the renewal,
//      and the licence register page lists what ends soon.
// Data (made up): retailers 900000194x, suppliers 'E2E S30 …', numbers E2E-…; removed
// by the global cleanup (users 90000019%, vendors 'E2E %').
import { expect, test } from '@playwright/test';
import { call, db, redis } from '../support/data';
import { expectNoBrowserStorage, signIn } from '../support/helpers';

test.describe.configure({ mode: 'serial' });

const plusDays = (n: number) => new Date(Date.now() + (n + 0.25) * 86_400_000).toISOString().slice(0, 10);
const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
function gstin(stateCode: string, pan: string) {
  const first14 = `${stateCode}${pan}1Z`;
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const p = CHARS.indexOf(first14[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(p / 36) + (p % 36);
  }
  return first14 + CHARS[(36 - (sum % 36)) % 36];
}

let d: { tag: string; supplier: string; gst: string; retailer: string; pan: string };

test.beforeAll(async ({}, info) => {
  const phone = info.project.name === 'phone';
  d = phone
    ? { tag: 'P', supplier: 'E2E S30 Phone Laboratories', gst: gstin('27', 'EEEES3030P'), retailer: '9000001942', pan: 'EEEPS3030P' }
    : { tag: 'D', supplier: 'E2E S30 Desk Laboratories', gst: gstin('27', 'EEEES3030D'), retailer: '9000001941', pan: 'EEEPS3030D' };
  // The retailer signs up (as the app or website does) with Forms 20 and 21; the admin has checked both
  const c = db(); const r = redis();
  await c.connect();
  try {
    await c.query("SET dawabag.maintenance = 'on'");
    const old = (await c.query(`SELECT id FROM users WHERE mobile = $1`, [d.retailer])).rows.map((x) => x.id);
    for (const t of ['kyc_documents', 'audit_logs', 'user_profiles', 'notifications', 'consent_records']) await c.query(`DELETE FROM ${t} WHERE user_id = ANY($1)`, [old]);
    await c.query('DELETE FROM users WHERE id = ANY($1)', [old]);
    await c.query(`DELETE FROM vendors WHERE name = $1`, [d.supplier]);
    const reg = await call('POST', '/auth/register', {
      customer_type: 'b2b_retailer', full_name: 'E2E S30 Retail Owner', mobile: d.retailer, password: 'Passw0rd!', email: `e2e-s30-${d.tag}@example.test`,
      pincode: '499919', business_name: `E2E S30 ${d.tag} Medical Stores`, pan_number: d.pan, gst_unregistered_declaration: true,
      accept_privacy_notice: true, age_confirmed: true,
      licences: [{ form: '20', licence_number: `E2E-${d.tag}-R20-01` }, { form: '21', licence_number: `E2E-${d.tag}-R21-02` }],
    });
    if (reg.status >= 300) throw new Error(`Could not register the retailer: ${JSON.stringify(reg.json)}`);
    await call('POST', '/auth/verify-otp', { mobile: d.retailer, otp: await r.get(`otp:${d.retailer}`) });
    // KYC as the admin leaves it: both licences checked, the account approved
    await c.query(`UPDATE party_licences SET status = 'verified', valid_upto = $2, verified_at = NOW()
                   WHERE user_id = (SELECT id FROM users WHERE mobile = $1) AND form = 'dl20'`, [d.retailer, plusDays(700)]);
    await c.query(`UPDATE party_licences SET status = 'verified', valid_upto = $2, verified_at = NOW()
                   WHERE user_id = (SELECT id FROM users WHERE mobile = $1) AND form = 'dl21'`, [d.retailer, plusDays(20)]);
    await c.query(`UPDATE users SET kyc_status = 'approved', kyc_approved_at = NOW() WHERE mobile = $1`, [d.retailer]);
  } finally { await c.end(); r.disconnect(); }
});

test('the admin adds a supplier with Form 25 and Form 20B; the list shows both', async ({ page }) => {
  await signIn(page, 'admin');
  await page.goto('/admin/suppliers');
  await page.getByRole('button', { name: 'Add supplier' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Business name *').fill(d.supplier);
  await dialog.getByLabel('GSTIN *').fill(d.gst);
  await dialog.getByLabel('State *').fill('Maharashtra');
  // Row 1 starts as Form 20B; make it Form 25, then add the 20B
  await dialog.getByLabel('Licence 1 — form', { exact: true }).selectOption('dl25');
  await dialog.getByLabel('Licence 1 — number', { exact: true }).fill(`E2E-${d.tag}-M25-01`);
  await dialog.getByLabel('Licence 1 — valid till', { exact: true }).fill(plusDays(600));
  await dialog.getByRole('button', { name: 'Add another licence' }).click();
  await dialog.getByLabel('Licence 2 — form', { exact: true }).selectOption('dl20b');
  await dialog.getByLabel('Licence 2 — number', { exact: true }).fill(`E2E-${d.tag}-W20B-02`);
  // An expired date is flagged at once
  await dialog.getByLabel('Licence 2 — valid till', { exact: true }).fill(plusDays(-3));
  await expect(dialog.getByText('This licence has expired — enter the renewed one')).toBeVisible();
  await dialog.getByLabel('Licence 2 — valid till', { exact: true }).fill(plusDays(25));
  await expect(dialog.getByText('Ends within 30 days — renew soon')).toBeVisible();
  await dialog.getByRole('button', { name: 'Add supplier', exact: true }).click();
  await expect(dialog).toBeHidden();

  const row = page.getByTestId('supplier-row').filter({ hasText: d.supplier });
  await expect(row).toBeVisible();
  await expect(row.getByText('2 licences')).toBeVisible();
  await expect(row.getByText(`E2E-${d.tag}-M25-01`)).toBeVisible();
  await expect(row.getByText(`E2E-${d.tag}-W20B-02`)).toBeVisible();
  await expect(row.getByText('Form 25', { exact: true })).toBeVisible();
  await expect(row.getByText('renewal due ≤ 30 days')).toBeVisible();
  await expectNoBrowserStorage(page);
});

test('the retailer sees both licences and sends a renewed Form 21', async ({ page }) => {
  await page.goto('/auth/login');
  await page.getByPlaceholder('9876543210').fill(d.retailer);
  await page.getByPlaceholder('••••••••').fill('Passw0rd!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).not.toHaveURL(/\/auth\/login/);
  await page.goto('/account');
  await page.getByRole('link', { name: 'Your drug licences' }).click();
  await expect(page.getByRole('heading', { name: 'Your drug licences', level: 1 })).toBeVisible();
  const list = page.getByRole('list', { name: 'Your drug licences' });
  await expect(list.getByTestId('licence-item')).toHaveCount(2);
  await expect(list.getByText(`E2E-${d.tag}-R20-01`)).toBeVisible();
  await expect(list.getByText('renew soon')).toBeVisible();          // Form 21 ends within 30 days
  await expect(page.getByText('Renew soon', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Send a renewed or another licence' }).click();
  await page.getByLabel('Licence 1 — form', { exact: true }).selectOption('dl21');
  await page.getByLabel('Licence 1 — number', { exact: true }).fill(`E2E-${d.tag}-R21-02`);
  await page.getByLabel('Licence 1 — valid till', { exact: true }).fill(plusDays(1000));
  await page.getByRole('button', { name: 'Send for checking' }).click();
  await expect(list.getByTestId('licence-item')).toHaveCount(3);
  await expect(list.getByText('waiting for Dawabag’s check')).toBeVisible();
  await expectNoBrowserStorage(page);
});

test('the admin sees every licence in KYC review and checks the renewal', async ({ page }) => {
  await signIn(page, 'admin');
  const c = db();
  await c.connect();
  const userId = (await c.query(`SELECT id FROM users WHERE mobile = $1`, [d.retailer])).rows[0].id;
  await c.end();
  await page.goto(`/admin/kyc/${userId}`);
  const card = page.getByLabel('Drug licences', { exact: true });
  const current = card.getByRole('list', { name: 'Buyer drug licences' });
  await expect(current.getByTestId('licence-item')).toHaveCount(3);
  await card.getByRole('button', { name: 'Check' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(`Check Form 21 E2E-${d.tag}-R21-02`)).toBeVisible();
  await dialog.getByRole('button', { name: 'Verify licence' }).click();
  await expect(dialog).toBeHidden();
  await expect(current.getByTestId('licence-item')).toHaveCount(2);  // the old Form 21 is now under "Replaced licences"
  await expect(card.getByText('Replaced licences (1)')).toBeVisible();

  // The register page lists partner, supplier and buyer licences ending soon
  await page.goto('/admin/licences');
  await page.getByRole('tab', { name: 'Ending in 30 days' }).click();
  await expect(page.getByTestId('party-licence-row').filter({ hasText: `E2E-${d.tag}-W20B-02` })).toBeVisible();
});
