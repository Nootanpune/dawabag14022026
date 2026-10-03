// Sprint 27 — a partner pharmacy uploads its billing software's stock report
// (synthetic MediVision Platinum layout), checks the columns and lines, asks Dawabag
// to add an unknown item, and applies the stock to its own ledger. Desktop and phone.
// Data: partner logins 900000192x, vendors 'E2E S27 …', SKU E2E-S27-…; removed by
// the global cleanup (users 90000019%, vendors 'E2E %', SKUs 'E2E-%').
import { expect, test } from '@playwright/test';
import { resolve } from 'path';
import { call, db, redis } from '../support/data';
import { expectNoBrowserStorage } from '../support/helpers';

const esm = new Function('p', 'return import(p)') as (p: string) => Promise<any>;
const password = 'Passw0rd!';
let mobile = '';
let file: Buffer;

test.beforeAll(async ({}, info) => {
  const phone = info.project.name === 'phone';
  mobile = phone ? '9000001928' : '9000001927';
  const c = db(); const r = redis();
  await c.connect();
  try {
    await c.query("SET ROLE dawabag_maintenance; SET dawabag.maintenance = 'on'");
    const old = (await c.query(`SELECT id FROM vendors WHERE name = $1`, [`E2E S27 Partner ${info.project.name}`])).rows.map((x) => x.id);
    for (const t of ['partner_item_links', 'partner_product_requests', 'partner_stock_imports', 'partner_import_mappings', 'partner_inventory']) {
      await c.query(`DELETE FROM ${t} WHERE partner_id = ANY($1)`, [old]);
    }
    await c.query('DELETE FROM partner_products WHERE partner_id = ANY($1)', [old]);
    await c.query('DELETE FROM vendor_users WHERE vendor_id = ANY($1)', [old]);
    await c.query('DELETE FROM vendors WHERE id = ANY($1)', [old]);
    const exists = (await c.query('SELECT id FROM users WHERE mobile = $1', [mobile])).rows[0];
    if (!exists) {
      await call('POST', '/auth/register', { customer_type: 'customer', full_name: `E2E S27 ${info.project.name}`, mobile, password,
        accept_privacy_notice: true, age_confirmed: true });
      const otp = await r.get(`otp:${mobile}`);
      const v = await call('POST', '/auth/verify-otp', { mobile, otp });
      if (v.status >= 300) throw new Error(`Could not register the partner login: ${JSON.stringify(v.json)}`);
    }
    await c.query(`UPDATE users SET role = 'partner' WHERE mobile = $1`, [mobile]);
    const vendor = (await c.query(
      `INSERT INTO vendors (name, drug_license_no, gst_number, pincode, city, state, vendor_type, approval_status, is_active, drug_license_type, drug_license_expiry)
       VALUES ($1, $2, '27ABCDE1927F1Z5', '411001', 'Pune', 'Maharashtra', 'marketplace_partner', 'approved', TRUE, 'dl20b', CURRENT_DATE + 400)
       RETURNING id`, [`E2E S27 Partner ${info.project.name}`, `DL-E2E-S27-${info.project.name}`])).rows[0].id;
    // Sprint 32: a partner sells only under checked licences in the register — retail and wholesale here
    await c.query(`INSERT INTO party_licences (vendor_id, form, licence_number, valid_upto, status, verified_at)
                   SELECT $1, f, $2, CURRENT_DATE + 400, 'verified', NOW() FROM unnest(ARRAY['dl20', 'dl21', 'dl20b', 'dl21b']) AS f`,
                  [vendor, `DL-E2E-S27-${info.project.name}`]);
    await c.query('INSERT INTO vendor_users (vendor_id, user_id) SELECT $1, id FROM users WHERE mobile = $2', [vendor, mobile]);
    await c.query(
      `INSERT INTO products (name, generic_name, sku, category, drug_schedule, gst_rate, hsn_code, mrp_paise, offer_price_paise, max_qty_per_order,
                             net_quantity, manufacturer_name, manufacturer_address, country_of_origin, is_active,
                             online_sale_status, online_sale_ref, online_sale_ref_date)
       VALUES ('E2E Alphamolix 500 mg Tablet', 'Alphamolix', 'E2E-S27-ALPHA', 'Pain relief', 'OTC', 5, '30049099', 3000, 2600, 10,
               '10 tablets', 'E2E Pharma Ltd', 'Plot 19, MIDC Satpur, Nashik 422007', 'India', TRUE, 'permitted', 'E2E test approval', CURRENT_DATE)
       ON CONFLICT (sku) DO NOTHING`);
  } finally { await c.end(); r.disconnect(); }
  const { buildMediVisionWorkbook } = await esm(resolve(__dirname, '../../backend/test/fixtures/partnerStockFile.mjs'));
  const exp = (months: number) => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + months); return d.toISOString().slice(0, 10); };
  file = await buildMediVisionWorkbook([
    { name: 'E2E ALPHAMOLIX 500MG TAB', unit: '10 TAB', com: 'E2E', tax: 5, batches: [
      { batch: 'EA1', exp: exp(18), purc: 18, ptr: 21, mrp: 30, sale: 26, qty: 24 },
      { batch: 'EA2', exp: exp(24), purc: 18, ptr: 21, mrp: 30, sale: 26, qty: 6 },
    ] },
    { name: 'ZORBEXIN 5 INJ', unit: 'VIAL', com: 'QRS', tax: 12, batches: [{ batch: 'Z1', exp: exp(14), purc: 120, ptr: 140, mrp: 200, sale: 180, qty: 3 }] },
    { name: 'OLDMOL 100 TAB', unit: '10 TAB', com: 'QRS', tax: 5, batches: [{ batch: 'E1', exp: '2025-01-01', purc: 5, ptr: 6, mrp: 10, sale: 9, qty: 2 }] },
  ], { company: 'E2E PARTNER (TEST)' });
});

test('a partner uploads a MediVision stock report, reviews it and applies it', async ({ page }) => {
  await page.goto('/auth/login');
  await page.getByPlaceholder('9876543210').fill(mobile);
  await page.getByPlaceholder('••••••••').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).not.toHaveURL(/\/auth\/login/);

  await page.goto('/partner/stock-import');
  await expect(page.getByRole('heading', { name: 'Upload stock' })).toBeVisible();
  await expect(page.getByText(/Export a batch-wise stock statement from your billing software/)).toBeVisible();
  await page.getByLabel('Choose stock file').setInputFiles({ name: 'stock-report.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: file });
  await page.getByRole('button', { name: 'Upload and check' }).click();

  // Columns: recognised as MediVision Platinum and pre-filled
  await expect(page).toHaveURL(/\/partner\/stock-import\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name: 'Which column holds what?' })).toBeVisible();
  await expect(page.getByText(/MediVision Platinum \(Allied Softtech\)/)).toBeVisible();
  await expect(page.getByLabel('Batch number')).toHaveValue('6');
  await page.getByRole('button', { name: 'Continue: check the lines' }).click();

  // Lines: 2 matched, 1 to review, 1 problem
  const summary = page.getByTestId('import-summary');
  await expect(summary).toContainText('Ready (matched)2');
  await expect(summary).toContainText('Need your review1');
  await expect(summary).toContainText('Problems1');
  await page.getByRole('button', { name: /^Needs review/ }).click();
  await expect(page.getByText('ZORBEXIN 5 INJ')).toBeVisible();
  await page.getByRole('button', { name: /Request all 1 unmatched/ }).click();
  await expect(page.getByText(/Requested as a new product/)).toBeVisible();
  await page.getByRole('button', { name: /^Problems/ }).click();
  await expect(page.getByText(/Expired on/)).toBeVisible();
  await page.getByRole('button', { name: /^Matched/ }).click();
  await expect(page.getByText('E2E Alphamolix 500 mg Tablet').first()).toBeVisible();

  // Apply with the catalogue-price acceptance for the new listing
  await page.getByRole('button', { name: 'Apply stock' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('2 lines (1 products, 30 packs)');
  await dialog.getByRole('button', { name: 'Apply stock' }).click();
  await expect(dialog.getByText(/Accept Dawabag's catalogue price/)).toBeVisible();
  await dialog.getByRole('checkbox').first().check();
  await dialog.getByRole('button', { name: 'Apply stock' }).click();
  await expect(page.getByTestId('apply-result')).toContainText('2 lines applied to 1 products');
  await expect(page.getByTestId('apply-result')).toContainText('1 new listings sent to Dawabag for review');

  // History shows it as applied; nothing kept in browser storage
  await page.getByRole('link', { name: 'All uploads' }).click();
  await expect(page.getByRole('list', { name: 'Past stock uploads' }).getByText('Applied').first()).toBeVisible();
  await expectNoBrowserStorage(page);
});

test('a file without stock columns is refused in plain words', async ({ page }) => {
  await page.goto('/auth/login');
  await page.getByPlaceholder('9876543210').fill(mobile);
  await page.getByPlaceholder('••••••••').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).not.toHaveURL(/\/auth\/login/);
  await page.goto('/partner/stock-import');
  await page.getByLabel('Choose stock file').setInputFiles({ name: 'notes.csv', mimeType: 'text/csv', buffer: Buffer.from('hello,world\n1,2\n') });
  await page.getByRole('button', { name: 'Upload and check' }).click();
  await expect(page.getByRole('alert').filter({ hasText: /column headings/ })).toContainText(/Could not find the column headings/);
});
