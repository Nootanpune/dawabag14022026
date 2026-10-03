// Sprint 32 — trade prices follow the buyer's drug licence live, in the browser
// (desktop and phone): a retail pharmacy whose Form 20 lapsed yesterday (KYC still
// approved — the nightly job has not run) sees retail prices and a plain banner on the
// product page, search, cart and checkout, with a link to send the renewal; once the
// renewal is checked the trade price is back. The admin dashboard warns when Dawabag's
// licence register has no wholesale licence (its own stock is then not offered to trade buyers).
// Data (made up): retailers 900000196x, product SKU E2E-S32-TP-x, numbers E2E-S32-…;
// removed by the global cleanup (users 90000019%, SKUs E2E-%).
import { expect, Page, test } from '@playwright/test';
import { call, db, people, PIN, redis } from '../support/data';
import { expectNoBrowserStorage, signIn } from '../support/helpers';

test.describe.configure({ mode: 'serial' });

let d: { tag: string; mobile: string; pan: string; sku: string; productId: string; name: string };

const lapse = async (mobile: string, days: number) => {
  const c = db();
  await c.connect();
  try {
    await c.query(`UPDATE party_licences SET valid_upto = CURRENT_DATE + $2::int
                   WHERE user_id = (SELECT id FROM users WHERE mobile = $1) AND form = 'dl20' AND status = 'verified'`, [mobile, days]);
  } finally { await c.end(); }
};

async function signInAs(page: Page, mobile: string) {
  await page.goto('/auth/login');
  await page.getByPlaceholder('9876543210').fill(mobile);
  await page.getByPlaceholder('••••••••').fill('Passw0rd!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).not.toHaveURL(/\/auth\/login/);
}

test.beforeAll(async ({}, info) => {
  const tag = info.project.name === 'phone' ? 'P' : 'D';
  d = { tag, mobile: tag === 'P' ? '9000001962' : '9000001961', pan: tag === 'P' ? 'EEEPS3232P' : 'EEEPS3232D',
    sku: `E2E-S32-TP-${tag}`, productId: '', name: `E2E Tradeprice ${tag} 250` };
  const c = db(); const r = redis();
  await c.connect();
  try {
    await c.query("SET ROLE dawabag_maintenance; SET dawabag.maintenance = 'on'");
    const old = (await c.query(`SELECT id FROM users WHERE mobile = $1`, [d.mobile])).rows.map((x) => x.id);
    for (const t of ['cart_items', 'carts', 'addresses', 'kyc_documents', 'audit_logs', 'user_profiles', 'notifications', 'consent_records']) {
      await c.query(`DELETE FROM ${t} WHERE user_id = ANY($1)`, [old]);
    }
    await c.query('DELETE FROM users WHERE id = ANY($1)', [old]);
    const reg = await call('POST', '/auth/register', {
      customer_type: 'b2b_retailer', full_name: 'E2E S32 Retail Owner', mobile: d.mobile, password: 'Passw0rd!', email: `e2e-s32-${tag}@example.test`,
      pincode: PIN, business_name: `E2E S32 ${tag} Medical Stores`, pan_number: d.pan, gst_unregistered_declaration: true,
      accept_privacy_notice: true, age_confirmed: true, licences: [{ form: '20', licence_number: `E2E-S32-${tag}-R20` }],
    });
    if (reg.status >= 300) throw new Error(`Could not register the retailer: ${JSON.stringify(reg.json)}`);
    await call('POST', '/auth/verify-otp', { mobile: d.mobile, otp: await r.get(`otp:${d.mobile}`) });
    // Checked by the admin, KYC approved; the licence then lapsed yesterday
    await c.query(`UPDATE party_licences SET status = 'verified', valid_upto = CURRENT_DATE + 300, verified_at = NOW()
                   WHERE user_id = (SELECT id FROM users WHERE mobile = $1)`, [d.mobile]);
    await c.query(`UPDATE users SET kyc_status = 'approved', kyc_approved_at = NOW() WHERE mobile = $1`, [d.mobile]);
    await c.query(`INSERT INTO addresses (user_id, full_name, mobile, address_line1, city, state, pincode, is_default)
                   SELECT id, 'E2E S32 Retailer', $1::text, '32 Market Road', 'Nashik', 'Maharashtra', $2, TRUE FROM users WHERE mobile = $1::text`, [d.mobile, PIN]);
    // A product with a trade price (PTR ₹30) below the retail price (₹40), in Dawabag's own stock
    const admin = (await call('POST', '/auth/login', { mobile: people.admin.mobile, password: people.admin.password })).json.data?.access_token;
    await c.query(`DELETE FROM inventory_batches WHERE product_id IN (SELECT id FROM products WHERE sku = $1)`, [d.sku]);
    await c.query(`DELETE FROM products WHERE sku = $1`, [d.sku]);
    const p = await call('POST', '/products', {
      name: d.name, sku: d.sku, category: 'Pain relief', drug_schedule: 'OTC', gst_rate: 12, hsn_code: '30049099',
      mrp_paise: 4500, offer_price_paise: 4000, ptr_price_paise: 3000, max_qty_per_order: 10, net_quantity: '15 tablets',
      manufacturer_name: 'E2E Pharma Ltd', manufacturer_address: 'Plot 19, MIDC Satpur, Nashik 422007', country_of_origin: 'India',
    }, admin);
    if (p.status !== 201) throw new Error(`Could not create the product: ${JSON.stringify(p.json)}`);
    d.productId = p.json.data.id;
    // Sprint 39 (C-10): new products start "not allowed online"; allowed here as a pharmacist would (dated reference)
    await c.query(`UPDATE products SET online_sale_status = 'permitted', online_sale_ref = 'E2E test approval', online_sale_ref_date = CURRENT_DATE
                   WHERE id = $1`, [d.productId]);
    await c.query(`INSERT INTO inventory_batches (product_id, batch_number, quantity_available, purchase_price_paise, expiry_date)
                   VALUES ($1, 'E2E-S32-B', 100, 2000, CURRENT_DATE + 500)`, [d.productId]);
  } finally { await c.end(); r.disconnect(); }
});

test('licence in date: trade price, no banner', async ({ page }) => {
  await signInAs(page, d.mobile);
  await page.goto(`/shop/${d.productId}`);
  await expect(page.getByRole('heading', { name: d.name })).toBeVisible();
  await expect(page.getByText('₹30.00').first()).toBeVisible();
  await expect(page.getByTestId('trade-price-banner')).toHaveCount(0);
});

test('licence lapsed yesterday: retail prices and the banner on product, search, cart and checkout', async ({ page }) => {
  await lapse(d.mobile, -1);
  await signInAs(page, d.mobile);
  await page.goto(`/shop/${d.productId}`);
  const banner = page.getByTestId('trade-price-banner');
  await expect(banner).toContainText(`Your drug licence Form 20 E2E-S32-${d.tag}-R20 expired on`);
  await expect(banner).toContainText('trade prices are paused until a renewal is checked');
  await expect(banner.getByRole('link', { name: 'Send the renewed licence' })).toHaveAttribute('href', '/account/licences');
  await expect(page.getByText('₹40.00').first()).toBeVisible();

  await page.goto(`/search?q=${encodeURIComponent(`Tradeprice ${d.tag}`)}`);
  await expect(page.getByTestId('trade-price-banner')).toBeVisible();

  await page.goto(`/shop/${d.productId}`);
  await Promise.all([
    page.waitForResponse((res) => /\/cart\/items\//.test(res.url()) && res.request().method() === 'PUT' && res.ok()),
    page.getByRole('button', { name: 'Add to cart' }).first().click(),
  ]);
  await page.goto('/cart');
  await expect(page.getByTestId('trade-price-banner')).toBeVisible();
  await expect(page.getByText('₹40.00').first()).toBeVisible();

  await page.goto('/checkout');
  await expect(page.getByTestId('trade-price-banner')).toBeVisible();
  await expectNoBrowserStorage(page);
});

test('renewal checked: trade price back, banner gone', async ({ page }) => {
  await lapse(d.mobile, 365);
  await signInAs(page, d.mobile);
  await page.goto(`/shop/${d.productId}`);
  await expect(page.getByText('₹30.00').first()).toBeVisible();
  await expect(page.getByTestId('trade-price-banner')).toHaveCount(0);
});

test('admin dashboard: no wholesale licence in the register → trade buyers not served from own stock', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'dashboard warning checked once, on desktop');
  const c = db();
  await c.connect();
  const paused = (await c.query(`UPDATE business_licences SET is_active = FALSE
    WHERE is_active AND licence_type IN ('wholesale_20b', 'wholesale_21b') RETURNING id`)).rows.map((x) => x.id);
  try {
    await signIn(page, 'admin');
    await page.goto('/admin');
    const box = page.getByTestId('selling-rights-warnings');
    await expect(box).toContainText('not offered to trade buyers');
    await expect(box).toContainText('wholesale drug licence (Form 20B or 21B)');
    await expect(box.getByRole('link', { name: 'Open the licence register' }).first()).toHaveAttribute('href', '/admin/licences');
  } finally {
    await c.query('UPDATE business_licences SET is_active = TRUE WHERE id = ANY($1)', [paused]);
    await c.end();
  }
});
