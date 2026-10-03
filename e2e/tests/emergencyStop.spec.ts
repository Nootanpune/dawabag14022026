// Sprint 38 — the emergency stop for prescription medicines (owner decision 2026-10-03):
// a super-admin pauses through a two-step confirmation, every visitor sees the banner,
// resuming removes it; the integrity page recomputes the hash chains; a partner sees its
// own Schedule H1 register (C-08, C-09, C-46). Data (made up): partner login 9000001938,
// vendor 'E2E S38 Partner'; removed by the global clean-up (users 90000019%, vendors 'E2E %').
import { expect, test } from '@playwright/test';
import { call, db, redis } from '../support/data';
import { expectNoBrowserStorage, signIn } from '../support/helpers';

const partnerLogin = { mobile: '9000001938', password: 'Passw0rd!' };

async function openTheStop() {
  const c = db();
  await c.connect();
  try {
    await c.query(`UPDATE app_settings SET value = '{"paused": false}' WHERE key = 'sales.rx_pause' AND value->>'paused' = 'true'`);
  } finally { await c.end(); }
}

test.beforeAll(openTheStop);
test.afterAll(openTheStop);

test('super-admin pauses prescription-medicine sales with a confirmation; the banner shows, then goes on resume', async ({ page, browser }) => {
  await signIn(page, 'admin');
  await page.goto('/admin/emergency-stop');
  await expect(page.getByRole('heading', { name: 'Emergency stop' })).toBeVisible();
  await expect(page.getByTestId('emergency-state')).toContainText('Prescription-medicine sales are open');
  await page.getByRole('button', { name: 'Pause prescription-medicine sales' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/Reason/).fill('E2E drill: notification received, legal review pending');
  await dialog.getByLabel(/Reference/).fill('GSR E2E(E)');
  await dialog.getByRole('button', { name: 'Next' }).click();
  const confirm = dialog.getByRole('button', { name: 'Pause sales now' });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel('Type PAUSE to confirm').fill('PAUSE');
  await confirm.click();
  await expect(page.getByTestId('emergency-state')).toContainText('PAUSED');
  await expect(page.getByTestId('emergency-state')).toContainText('GSR E2E(E)');

  // A visitor who is not signed in sees the plain banner (from the server, nothing stored)
  const visitor = await browser.newPage();
  await visitor.goto('/');
  await expect(visitor.getByTestId('rx-sales-banner')).toContainText('prescription medicines are paused');
  await expect(visitor.getByTestId('rx-sales-banner')).toContainText('GSR E2E(E)');
  await expect(visitor.getByTestId('rx-sales-banner')).not.toContainText('legal review');
  await expectNoBrowserStorage(visitor);

  await page.getByRole('button', { name: 'Resume sales' }).click();
  await page.getByRole('dialog').getByLabel('Type RESUME to confirm').fill('RESUME');
  await page.getByRole('dialog').getByRole('button', { name: 'Resume sales' }).click();
  await expect(page.getByTestId('emergency-state')).toContainText('Prescription-medicine sales are open');
  await expect(page.getByText('Paused', { exact: true }).first()).toBeVisible();   // history
  await visitor.reload();
  await expect(visitor.getByTestId('rx-sales-banner')).toHaveCount(0);
  await visitor.close();
});

test('the admin recomputes the H1 register and audit-log chains', async ({ page }) => {
  await signIn(page, 'admin');
  await page.goto('/admin/integrity');
  await expect(page.getByRole('heading', { name: 'Record integrity' })).toBeVisible();
  await page.getByRole('button', { name: 'Check the audit log' }).click();
  await expect(page.getByTestId('chain-result').first()).toContainText('Audit log');
  await page.getByRole('button', { name: 'Check the H1 registers' }).click();
  await expect(page.getByText(/No register entries yet|entr(y|ies) recomputed/).first()).toBeVisible();
});

test('a partner opens its own Schedule H1 register and checks it', async ({ page }) => {
  const c = db(); const r = redis();
  await c.connect();
  try {
    await c.query("SET ROLE dawabag_maintenance; SET dawabag.maintenance = 'on'");
    const old = (await c.query(`SELECT id FROM vendors WHERE name = 'E2E S38 Partner'`)).rows.map((x) => x.id);
    await c.query('DELETE FROM vendor_users WHERE vendor_id = ANY($1)', [old]);
    await c.query('DELETE FROM vendors WHERE id = ANY($1)', [old]);
    if (!(await c.query('SELECT 1 FROM users WHERE mobile = $1', [partnerLogin.mobile])).rows[0]) {
      await call('POST', '/auth/register', { customer_type: 'customer', full_name: 'E2E S38 Partner', mobile: partnerLogin.mobile,
        password: partnerLogin.password, accept_privacy_notice: true, age_confirmed: true });
      const otp = await r.get(`otp:${partnerLogin.mobile}`);
      const v = await call('POST', '/auth/verify-otp', { mobile: partnerLogin.mobile, otp });
      if (v.status >= 300) throw new Error(`Could not register the partner login: ${JSON.stringify(v.json)}`);
    }
    await c.query(`UPDATE users SET role = 'partner' WHERE mobile = $1`, [partnerLogin.mobile]);
    const vendorId = (await c.query(
      `INSERT INTO vendors (name, drug_license_no, gst_number, pincode, city, state, vendor_type, approval_status, is_active,
                            invoice_prefix, drug_license_type, drug_license_expiry)
       VALUES ('E2E S38 Partner', 'DL-E2E-S38', '27ABCDE1938F1Z5', '499919', 'Nashik', 'Maharashtra', 'marketplace_partner', 'approved', TRUE,
               'E2E38', 'dl20', CURRENT_DATE + 500) RETURNING id`)).rows[0].id;
    await c.query('INSERT INTO vendor_users (vendor_id, user_id) SELECT $1, id FROM users WHERE mobile = $2', [vendorId, partnerLogin.mobile]);
  } finally { await c.end(); r.disconnect(); }

  await page.goto('/auth/login');
  await page.getByPlaceholder('9876543210').fill(partnerLogin.mobile);
  await page.getByPlaceholder('••••••••').fill(partnerLogin.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).not.toHaveURL(/\/auth\/login/);
  await page.goto('/partner/h1-register');
  await expect(page.getByRole('heading', { name: 'Schedule H1 register' })).toBeVisible();
  await expect(page.getByText('No Schedule H1 supplies in this period')).toBeVisible();
  await page.getByRole('button', { name: 'Check the register' }).click();
  await expect(page.getByText('No entries yet.')).toBeVisible();
  await expectNoBrowserStorage(page);
});
