// Sprint 37 — live stock feed: items waiting for a check are flagged URGENT with a slowly
// blinking badge in the partner and admin portals (owner decision 2026-10-03), which is
// still and high-contrast when the viewer asks for reduced motion (WCAG 2.3.1 / 2.3.3).
// Data (made up): partner login 9000001937, vendor 'E2E S37 Live Partner' and its two
// waiting items; removed by the global clean-up (users 90000019%, vendors 'E2E %').
import { expect, test, type Locator, type Page } from '@playwright/test';
import { call, db, redis } from '../support/data';
import { expectNoBrowserStorage, signIn } from '../support/helpers';

const partnerLogin = { mobile: '9000001937', password: 'Passw0rd!' };
let vendorId = '';

test.beforeAll(async () => {
  const c = db(); const r = redis();
  await c.connect();
  try {
    await c.query("SET dawabag.maintenance = 'on'");
    const old = (await c.query(`SELECT id FROM vendors WHERE name = 'E2E S37 Live Partner'`)).rows.map((x) => x.id);
    for (const t of ['partner_feed_checks', 'partner_stock_feeds']) await c.query(`DELETE FROM ${t} WHERE partner_id = ANY($1)`, [old]);
    await c.query('DELETE FROM vendor_users WHERE vendor_id = ANY($1)', [old]);
    await c.query('DELETE FROM vendors WHERE id = ANY($1)', [old]);
    if (!(await c.query('SELECT 1 FROM users WHERE mobile = $1', [partnerLogin.mobile])).rows[0]) {
      await call('POST', '/auth/register', { customer_type: 'customer', full_name: 'E2E S37 Partner', mobile: partnerLogin.mobile,
        password: partnerLogin.password, accept_privacy_notice: true, age_confirmed: true });
      const otp = await r.get(`otp:${partnerLogin.mobile}`);
      const v = await call('POST', '/auth/verify-otp', { mobile: partnerLogin.mobile, otp });
      if (v.status >= 300) throw new Error(`Could not register the partner login: ${JSON.stringify(v.json)}`);
    }
    await c.query(`UPDATE users SET role = 'partner' WHERE mobile = $1`, [partnerLogin.mobile]);
    vendorId = (await c.query(
      `INSERT INTO vendors (name, drug_license_no, gst_number, pincode, city, state, vendor_type, approval_status, is_active,
                            invoice_prefix, drug_license_type, drug_license_expiry)
       VALUES ('E2E S37 Live Partner', 'DL-E2E-S37', '27ABCDE1937F1Z5', '499919', 'Nashik', 'Maharashtra', 'marketplace_partner', 'approved', TRUE,
               'E2E37', 'dl20b', CURRENT_DATE + 500) RETURNING id`)).rows[0].id;
    await c.query('INSERT INTO vendor_users (vendor_id, user_id) SELECT $1, id FROM users WHERE mobile = $2', [vendorId, partnerLogin.mobile]);
    await c.query(`INSERT INTO partner_stock_feeds (partner_id, mode, last_sequence, last_taken_at, last_received_at) VALUES ($1, 'live', 7, NOW(), NOW())`, [vendorId]);
    await c.query(
      `INSERT INTO partner_feed_checks (partner_id, kind, item_key, item_name, details) VALUES
         ($1, 'new_product', 'code:E2E37-NEW', 'E2E37 NEWOMOL 500MG TAB', '{"pack": "10 TAB", "quantity": 12, "mrp_paise": 3000, "batches": 1}'),
         ($1, 'new_product', 'code:E2E37-TWO', 'E2E37 SECONDIN 5MG TAB', '{"pack": "10 TAB", "quantity": 4, "mrp_paise": 1500, "batches": 1}')`, [vendorId]);
  } finally { await c.end(); r.disconnect(); }
});

async function partnerSignIn(page: Page) {
  await page.goto('/auth/login');
  await page.getByPlaceholder('9876543210').fill(partnerLogin.mobile);
  await page.getByPlaceholder('••••••••').fill(partnerLogin.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).not.toHaveURL(/\/auth\/login/);
}

const style = (l: Locator) => l.evaluate((el) => {
  const s = getComputedStyle(el);
  return { name: s.animationName, duration: s.animationDuration, bg: s.backgroundColor, color: s.color, shadow: s.boxShadow };
});

test('partner portal: waiting items blink urgently in the header, the menu and the live-feed page', async ({ page }) => {
  await partnerSignIn(page);
  await page.goto('/partner');
  const header = page.getByTestId('header-urgent-badge');
  await expect(header).toBeVisible();
  await expect(header).toContainText('2');
  await expect(header).toHaveAttribute('aria-label', 'Urgent: 2 stock items to check');
  const s = await style(header);
  expect(s.name).toBe('urgent-blink');
  // One cycle every 2 s: 0.5 flashes a second, far below WCAG 2.3.1's 3 a second
  expect(parseFloat(s.duration)).toBeGreaterThanOrEqual(1);
  expect(s.color).toBe('rgb(255, 255, 255)');
  await expect(page.getByTestId('nav-urgent-badge')).toContainText('2');

  await page.getByRole('link', { name: 'Open the live stock feed' }).click();
  await expect(page).toHaveURL(/\/partner\/stock-feed$/);
  await expect(page.getByRole('heading', { name: 'Live stock feed' })).toBeVisible();
  await expect(page.getByTestId('feed-last-updated')).not.toHaveText(/no snapshot/);
  await expect(page.getByTestId('page-urgent-badge')).toContainText('2');
  await expect(page.getByTestId('feed-check-row')).toHaveCount(2);
  await expect(page.getByTestId('feed-check-row').filter({ hasText: 'E2E37 NEWOMOL 500MG TAB' })).toContainText('Link to product');
  await expectNoBrowserStorage(page);
});

test('reduced motion: the badge stands still with a high-contrast ring', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await partnerSignIn(page);
  await page.goto('/partner/stock-feed');
  const badge = page.getByTestId('page-urgent-badge');
  await expect(badge).toBeVisible();
  const s = await style(badge);
  expect(s.name).toBe('none');
  expect(s.bg).toBe('rgb(127, 29, 29)');      // red-900: white text 10.3:1
  expect(s.shadow).not.toBe('none');
});

test('admin portal: the waiting count blinks in the header and the menu, per partner on Live stock feeds', async ({ page }) => {
  await signIn(page, 'admin');
  await page.goto('/admin');
  const header = page.getByTestId('header-urgent-badge');
  await expect(header).toBeVisible();
  expect(parseInt((await header.innerText()).trim(), 10)).toBeGreaterThanOrEqual(2);
  expect((await style(header)).name).toBe('urgent-blink');
  await expect(page.getByRole('link', { name: /Live stock feeds/ }).getByTestId('nav-urgent-badge')).toBeVisible();
  await page.goto('/admin/stock-feeds');
  const row = page.getByTestId('feed-partner-list').getByRole('listitem').filter({ hasText: 'E2E S37 Live Partner' });
  await expect(row).toContainText('Stock last updated');
  await expect(row.locator('.urgent-badge')).toContainText('2');
  // Read-only for Dawabag: the partner decides (seller of record)
  await expect(page.getByTestId('feed-check-list').getByRole('button', { name: 'Link to product' })).toHaveCount(0);
  await page.goto(`/admin/partners/${vendorId}`);
  await expect(page.getByTestId('feed-settings')).toContainText('Stock last updated');
  await expect(page.getByTestId('feed-settings').getByRole('radio', { name: /Live/ })).toBeChecked();
});
