// Sprint 47 — who may buy a product, in the browser. A pharmacist restricts a product to doctors
// and hospitals (with a reason). Everyone still finds it, with the label "Supplied only to doctors
// and hospitals"; a consumer gets no Add to cart (and the server refuses the add anyway, 403
// BUYER_RESTRICTED); the verified doctor can add it; the pharmacist sees "Who may buy" with its
// history on the online-sale page. Data (made up): product SKU E2E-S47-HOSP; removed by the
// global cleanup (SKUs E2E-%). Nothing is kept in the browser (standing rule).
import { expect, test } from '@playwright/test';
import { call, db, people } from '../support/data';
import { expectNoBrowserStorage, signIn } from '../support/helpers';

test.describe.configure({ mode: 'serial' });

const SKU = 'E2E-S47-HOSP';
const NAME = 'E2E Hospitase Demo 50 Injection';
const LABEL = 'Supplied only to doctors and hospitals';
let productId = '';

const tokenOf = async (who: keyof typeof people) =>
  (await call('POST', '/auth/login', { mobile: people[who].mobile, password: people[who].password })).json.data?.access_token as string;

test.beforeAll(async () => {
  const c = db();
  await c.connect();
  try {
    await c.query("SET ROLE dawabag_maintenance; SET dawabag.maintenance = 'on'");
    const old = (await c.query(`SELECT id FROM products WHERE sku = $1`, [SKU])).rows.map((r) => r.id);
    for (const t of ['cart_items', 'inventory_batches', 'product_buyer_restriction_log', 'product_online_status_log']) {
      await c.query(`DELETE FROM ${t} WHERE product_id = ANY($1)`, [old]);
    }
    await c.query(`DELETE FROM products WHERE id = ANY($1)`, [old]);
    const p = await call('POST', '/products', {
      name: NAME, sku: SKU, category: 'Hospital use', drug_schedule: 'OTC', gst_rate: 12, hsn_code: '30049099',
      mrp_paise: 90000, offer_price_paise: 85000, max_qty_per_order: 5, net_quantity: '1 vial',
      manufacturer_name: 'E2E Pharma Ltd', manufacturer_address: 'Plot 19, MIDC Satpur, Nashik 422007', country_of_origin: 'India',
    }, await tokenOf('admin'));
    if (p.status !== 201) throw new Error(`Could not create the product: ${JSON.stringify(p.json)}`);
    productId = p.json.data.id;
    await c.query(`UPDATE products SET online_sale_status = 'permitted', online_sale_ref = 'E2E test approval', online_sale_ref_date = CURRENT_DATE
                   WHERE id = $1`, [productId]);
    await c.query(`INSERT INTO inventory_batches (product_id, batch_number, quantity_available, purchase_price_paise, expiry_date)
                   VALUES ($1, 'E2E-S47-B', 50, 40000, CURRENT_DATE + 500)`, [productId]);
  } finally { await c.end(); }
  // As a registered pharmacist would, with the reason recorded (an admin could not)
  const admin = await call('PUT', `/buyer-restriction/products/${productId}`, { restriction: 'practitioners_only', reason: 'E2E: hospital use only' }, await tokenOf('admin'));
  if (admin.status !== 403) throw new Error(`An admin must not set who may buy: ${admin.status}`);
  const r = await call('PUT', `/buyer-restriction/products/${productId}`,
    { restriction: 'practitioners_only', reason: 'E2E: hospital use only, under specialist supervision' }, await tokenOf('pharmacist'));
  if (r.status !== 200) throw new Error(`Could not restrict the product: ${JSON.stringify(r.json)}`);
});

test('search: everyone sees it with the label; a guest gets no Add', async ({ page }) => {
  await page.goto('/search?q=E2E%20Hospitase');
  const card = page.locator('.card', { hasText: NAME }).first();
  await expect(card).toBeVisible();
  await expect(card.getByTestId('buyer-restriction-note')).toContainText(LABEL);
  await expect(card.getByTestId('buyer-restricted')).toContainText(LABEL);
  await expect(card.getByRole('button', { name: `Add ${NAME} to cart` })).toHaveCount(0);
});

test('consumer: product page explains who may buy it, no Add; the server refuses the add', async ({ page }) => {
  await signIn(page, 'buyer');
  await page.goto(`/shop/${productId}`);
  const note = page.getByTestId('buyer-restriction-note').first();
  await expect(note).toContainText(LABEL);
  await expect(note).toContainText('Your account cannot add it to the cart.');
  await expect(page.getByRole('button', { name: /Add .*to cart/ })).toHaveCount(0);
  // Whatever a screen shows, the server decides: the add is refused with a plain message
  const r = await call('PUT', `/cart/items/${productId}`, { quantity: 1 }, await tokenOf('buyer'));
  expect(r.status).toBe(403);
  expect(r.json.code).toBe('BUYER_RESTRICTED');
  expect(r.json.message).toContain('is supplied only to doctors and hospitals');
  await expectNoBrowserStorage(page);
});

test('verified doctor: the label, and Add to cart works', async ({ page }) => {
  await signIn(page, 'doctor');
  await page.goto(`/shop/${productId}`);
  await expect(page.getByTestId('buyer-restriction-note').first()).toContainText(LABEL);
  await Promise.all([
    page.waitForResponse((r) => /\/cart\/items\//.test(r.url()) && r.request().method() === 'PUT' && r.ok()),
    page.getByRole('button', { name: /Add .*to cart/ }).first().click(),
  ]);
  await expect(page.getByText('In your cart')).toBeVisible();
  // leave the doctor's cart as it was
  await call('PUT', `/cart/items/${productId}`, { quantity: 0 }, await tokenOf('doctor'));
});

test('pharmacist: "Who may buy" on the online-sale page, with the history', async ({ page }) => {
  await signIn(page, 'pharmacist');
  await page.goto(`/staff/online-sale?q=${SKU}`);
  const row = page.getByTestId('online-sale-row').filter({ hasText: NAME });
  await expect(row.getByTestId('buyer-restriction-badge')).toHaveText('Doctors and hospitals only');
  await row.getByRole('button', { name: `Who may buy ${NAME}` }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByTestId('buyer-restriction-fields')).toBeVisible();
  await expect(dialog).toContainText('E2E: hospital use only, under specialist supervision');
  await expect(dialog).toContainText('E2E Pharmacist');
});
