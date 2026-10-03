// Sprint 40 — GDP excursion queue (C-25), mock recall drill (C-28) and the self-inspection
// register (C-34) in the browser. Data (made up): product SKU E2E-S40-COLD with batch
// E2E-S40-C1; removed by the global clean-up (SKUs E2E-%, users 90000019%).
import { expect, test } from '@playwright/test';
import { call, db, people } from '../support/data';
import { expectNoBrowserStorage, signIn } from '../support/helpers';

const SKU = 'E2E-S40-COLD';
const BATCH = 'E2E-S40-C1';
let batchId = '';

async function token(who: keyof typeof people) {
  return (await call('POST', '/auth/login', { mobile: people[who].mobile, password: people[who].password })).json.data?.access_token as string;
}

test.beforeAll(async () => {
  const admin = await token('admin');
  const c = db();
  await c.connect();
  try {
    let id = (await c.query(`SELECT id FROM products WHERE sku = $1`, [SKU])).rows[0]?.id as string | undefined;
    if (!id) {
      const p = await call('POST', '/products', {
        name: 'E2E S40 Insulin pen', sku: SKU, category: 'Diabetes', drug_schedule: 'Schedule H', gst_rate: 5, hsn_code: '30043110',
        mrp_paise: 50000, offer_price_paise: 45000, max_qty_per_order: 2, net_quantity: '1 pen', cold_chain: true, storage_instructions: 'Store at 2–8 °C',
        manufacturer_name: 'E2E Pharma Ltd', manufacturer_address: 'Plot 19, MIDC Satpur, Nashik 422007', country_of_origin: 'India',
      }, admin);
      if (p.status !== 201) throw new Error(`product: ${JSON.stringify(p.json)}`);
      id = p.json.data.id as string;
    }
    batchId = (await c.query(`INSERT INTO inventory_batches (product_id, batch_number, quantity_available, purchase_price_paise, expiry_date, storage_location)
      VALUES ($1, $2, 12, 30000, CURRENT_DATE + 400, 'E2E fridge 1') RETURNING id`, [id, BATCH])).rows[0].id;
  } finally { await c.end(); }
  // A cold-chain reading of 11 °C: recorded as an excursion, the batch on hold
  const r = await call('POST', `/gdp/batches/own/${batchId}/records`, { event_kind: 'temperature_reading', temperature_c: 11, notes: 'E2E fridge door left open' }, admin);
  if (r.status !== 201 || r.json.data?.batch_gdp_status !== 'on_hold') throw new Error(`excursion: ${JSON.stringify(r.json)}`);
});

test('a pharmacist releases a held batch from the GDP excursion queue (C-25)', async ({ page }) => {
  await signIn(page, 'pharmacist');
  await page.goto('/staff/gdp/excursions');
  await expect(page.getByRole('heading', { name: 'Excursions waiting for a pharmacist' })).toBeVisible();
  const row = page.getByTestId('excursion-row').filter({ hasText: BATCH });
  await expect(row).toContainText('E2E fridge door left open');
  await expect(row.getByTestId('gdp-status')).toContainText('On hold');
  await row.getByRole('button', { name: 'Decide…' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/still fit to sell/).fill('short');
  await expect(dialog.getByRole('button', { name: 'Record decision' })).toBeDisabled();
  await dialog.getByLabel(/still fit to sell/).fill('Data logger: 11 °C for 15 minutes; maker allows 25 °C for 24 hours');
  await dialog.getByRole('button', { name: 'Record decision' }).click();
  await expect(page.getByText('Released: the batch can be sold again')).toBeVisible();
  await expect(page.getByTestId('excursion-row').filter({ hasText: BATCH })).toHaveCount(0);

  // The batch's GDP log shows the excursion and the named pharmacist's decision
  await page.goto(`/staff/gdp/own/${batchId}`);
  await expect(page.getByRole('heading', { name: new RegExp(`batch ${BATCH}`) })).toBeVisible();
  const log = page.getByTestId('gdp-log-row');
  await expect(log.filter({ hasText: 'Excursion' })).toContainText('E2E fridge door left open');
  await expect(log.filter({ hasText: 'Pharmacist decision' })).toContainText('E2E-MSPC-33');
  await expect(page.getByTestId('gdp-status').first()).toContainText('OK');
  await expectNoBrowserStorage(page);
});

test('an admin runs a mock recall drill and reads its report (C-28)', async ({ page }) => {
  await signIn(page, 'admin');
  await page.goto('/admin/recall-drills');
  await expect(page.getByRole('heading', { name: 'Mock recall drills' })).toBeVisible();
  await page.getByLabel('Batch', { exact: true }).fill('E2E-S40');
  await page.getByRole('button', { name: new RegExp(BATCH) }).click();
  await page.getByLabel('Scenario').fill('E2E drill: maker reports a cold-chain failure in transit');
  await page.getByRole('button', { name: 'Start drill' }).click();
  await expect(page).toHaveURL(/\/admin\/recall-drills\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name: /Mock recall drill DRILL-/ })).toBeVisible();
  await expect(page.getByText('Trace only — no buyer, partner or regulator was contacted (C-28)')).toBeVisible();
  await expect(page.getByTestId('drill-time')).toContainText(' s');
  await expect(page.getByTestId('drill-stat-On hand')).toHaveText('12');
  await expect(page.getByText(/E2E fridge 1 · 12 available/)).toBeVisible();
  await page.getByLabel(/Conclusion/).fill('Batch found at once in the Dawabag fridge; no sales to trace');
  await page.getByRole('button', { name: 'Close the drill' }).click();
  await expect(page.getByText(/^Conclusion: Batch found at once/)).toBeVisible();
  await page.goto('/admin/recall-drills');
  await expect(page.getByTestId('drill-row').filter({ hasText: BATCH }).first()).toContainText('Closed');
});

test('the self-inspection register lists the monthly checklist and its due date (C-34)', async ({ page }) => {
  await signIn(page, 'pharmacist');
  await page.goto('/staff/self-inspections');
  await expect(page.getByRole('heading', { name: 'Self-inspections' })).toBeVisible();
  const monthly = page.getByTestId('si-template').filter({ hasText: 'Monthly pharmacy self-inspection' });
  await expect(monthly).toContainText('next due');
  await monthly.getByRole('link', { name: 'Record inspection' }).click();
  await expect(page.getByRole('heading', { name: 'Inspection: Monthly pharmacy self-inspection' })).toBeVisible();
  await expect(page.getByTestId('si-item')).toHaveCount(8);
  await expect(page.getByRole('button', { name: 'Save inspection' })).toBeDisabled();
});

test('with no SMS provider the screens say codes are not switched on instead of "code sent"', async ({ page }) => {
  // The server's answer when MSG91 is not configured (backend smoke test sprint40 checks the API itself)
  const message = 'Text-message codes are not switched on yet. Please sign in with your password, or ask the admin to reset it.';
  await page.route('**/auth/send-otp', (route) => route.fulfill({ status: 503, contentType: 'application/json',
    body: JSON.stringify({ success: false, message, error: message, code: 'SMS_NOT_CONFIGURED' }) }));
  await page.goto('/auth/forgot-password');
  await page.getByLabel('Mobile number').fill(people.buyer.mobile);
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect(page.getByTestId('sms-unavailable')).toContainText(message);
  await expect(page.getByText(/we have sent it a code/)).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Sign in with your password' })).toBeVisible();

  await page.goto('/auth/login');
  await page.getByRole('button', { name: 'One-time code' }).click();
  await page.getByPlaceholder('9876543210').fill(people.buyer.mobile);
  await page.getByRole('button', { name: /Send code/ }).click();
  await expect(page.getByTestId('sms-unavailable')).toContainText(message);
});
