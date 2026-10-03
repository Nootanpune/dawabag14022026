// Sprint 36 — automatic stock upload: the admin issues an API key for a partner's
// billing software on the partner's page, sees it ONCE, and revokes it; the key works
// only until then (C-44, C-46). Data (made up): partner 'E2E S36 Feed Partner'
// (removed by the global clean-up with every 'E2E …' vendor).
import { expect, test } from '@playwright/test';
import { API, db } from '../support/data';
import { expectNoBrowserStorage, signIn } from '../support/helpers';

let vendorId = '';

test.beforeAll(async () => {
  const c = db();
  await c.connect();
  try {
    await c.query(`DELETE FROM partner_api_keys WHERE partner_id IN (SELECT id FROM vendors WHERE name = 'E2E S36 Feed Partner')`);
    await c.query(`DELETE FROM vendors WHERE name = 'E2E S36 Feed Partner'`);
    vendorId = (await c.query(
      `INSERT INTO vendors (name, drug_license_no, gst_number, pincode, city, state, vendor_type, approval_status, is_active,
                            invoice_prefix, drug_license_type, drug_license_expiry)
       VALUES ('E2E S36 Feed Partner', 'DL-E2E-S36', '27ABCDE1936F1Z5', '499919', 'Nashik', 'Maharashtra', 'marketplace_partner', 'approved', TRUE,
               'E2E36', 'dl20b', CURRENT_DATE + 500) RETURNING id`)).rows[0].id;
  } finally { await c.end(); }
});

const whoami = async (key: string) =>
  (await fetch(`${API}/partner-feed/${vendorId}/whoami`, { headers: { Authorization: `Bearer ${key}` } })).status;

test('admin issues a stock-feed key, sees it once, and revokes it', async ({ page }) => {
  await signIn(page, 'admin');
  await page.goto(`/admin/partners/${vendorId}`);
  const panel = page.getByTestId('api-keys-panel');
  await expect(panel.getByRole('heading', { name: 'Automatic stock upload (API keys)' })).toBeVisible();
  await expect(panel).toContainText(`/partner-feed/${vendorId}/stock-files`);
  await panel.getByRole('button', { name: 'New key' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Which computer or program will use it?').fill('E2E billing PC');
  await dialog.getByRole('button', { name: 'Issue key' }).click();
  const shown = dialog.getByTestId('issued-key');
  await expect(shown).toContainText('will not be shown again');
  const key = (await shown.getByLabel('API key', { exact: true }).innerText()).trim();
  expect(key).toMatch(/^dwbk_[a-z0-9]{10}_[A-Za-z0-9_-]{43}$/);
  expect(await whoami(key)).toBe(200);
  await dialog.getByRole('button', { name: 'I have copied it' }).click();
  await expect(dialog).toBeHidden();

  // Listed by prefix only; the key itself is nowhere on the page any more
  const row = panel.getByTestId('api-key-row').filter({ hasText: 'E2E billing PC' });
  await expect(row).toContainText(`${key.split('_').slice(0, 2).join('_')}_…`);
  expect(await page.content()).not.toContain(key);
  await expectNoBrowserStorage(page);

  await row.getByRole('button', { name: 'Revoke key E2E billing PC' }).click();
  await page.getByRole('dialog').getByRole('textbox').fill('PC replaced');
  await page.getByRole('dialog').getByRole('button', { name: 'Revoke key' }).click();
  await expect(row).toContainText('revoked');
  await expect(row).toContainText('PC replaced');
  expect(await whoami(key)).toBe(401);
});
