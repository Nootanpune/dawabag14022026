// Sprint 33 — the product page (medicine information with empty sections hidden,
// substitutes and their full list, delivery date / expiry / cold-chain lines, trust
// pages), "My medicines" reminders, the health profile, and the pharmacist seeing
// the buyer's allergies when checking a prescription. Desktop and phone.
// Test data: SKUs E2E-S33-* (removed with every E2E- product), the shared E2E people.
import { expect, test } from '@playwright/test';
import { call, db, people, PIN } from '../support/data';
import { expectNoBrowserStorage, signIn } from '../support/helpers';

test.describe.configure({ mode: 'serial' });

const P: Record<string, string> = {};
const token = async (who: keyof typeof people) =>
  (await call('POST', '/auth/login', { mobile: people[who].mobile, password: people[who].password })).json.data?.access_token as string;

test.beforeAll(async () => {
  const c = db();
  await c.connect();
  try {
    const product = async (key: string, sku: string, name: string, price: number, pack: string, extra: { cold?: boolean; schedule?: string } = {}) => {
      const old = (await c.query(`SELECT id FROM products WHERE sku = $1`, [sku])).rows[0];
      if (old) { P[key] = old.id; return; }
      P[key] = (await c.query(
        `INSERT INTO products (name, generic_name, sku, category, drug_schedule, gst_rate, hsn_code, mrp_paise, offer_price_paise, max_qty_per_order,
                               net_quantity, manufacturer_name, manufacturer_address, country_of_origin, is_active, cold_chain)
         VALUES ($1, $2, $3, 'Pain relief', $4, 12, '30049099', $5, $5, 10, $6, 'E2E Remedies Ltd', 'Plot 33, MIDC Satpur, Nashik', 'India', TRUE, $7)
         RETURNING id`, [name, extra.cold ? 'E2E Zorinsulin' : 'E2E Zorvaquin', sku, extra.schedule ?? 'OTC', price, pack, !!extra.cold])).rows[0].id;
      await c.query(`INSERT INTO inventory_batches (product_id, batch_number, quantity_available, purchase_price_paise, expiry_date)
                     VALUES ($1, 'E2E-S33-B', 100, 300, DATE '2028-03-15')`, [P[key]]);
    };
    await product('main', 'E2E-S33-MAIN', 'E2E Zorvex 650 Tablet', 3000, '10 tablets', { schedule: 'Schedule H' });
    await product('sub', 'E2E-S33-SUB', 'E2E Zorvaquin 650 mg Tablet', 3000, '20 tablets', { schedule: 'Schedule H' });
    await product('subOtc', 'E2E-S33-SUB2', 'E2E Calzor 650 Tablet', 2400, '10 tablets', { schedule: 'Schedule H' });
    await product('cold', 'E2E-S33-COLD', 'E2E Zorinsulin 40 IU Injection', 45000, '1 vial', { cold: true, schedule: 'Schedule H' });
    const ph = (await c.query(`UPDATE users SET pharmacist_reg_no = 'E2E-MSPC-33' WHERE mobile = $1 RETURNING id`, [people.pharmacist.mobile])).rows[0].id;
    // Approved medicine information (as after the pharmacist's review): some sections deliberately empty
    await c.query(`DELETE FROM product_info_versions WHERE product_id = $1`, [P.main]);
    await c.query(
      `INSERT INTO product_info_versions (product_id, version, status, content, reviewed_by, reviewed_at, reviewer_name, reviewer_reg_no, review_notes)
       VALUES ($1, 1, 'approved', $2, $3, NOW(), 'E2E Pharmacist', 'E2E-MSPC-33', 'Checked against the package insert')`,
      [P.main, JSON.stringify({
        overview: 'E2E Zorvex relieves pain and fever.', uses: ['Fever', 'Headache'], how_to_use: 'Take with water after food.', how_it_works: '',
        side_effects: { common: ['Nausea'], serious: [], contact_doctor_if: ['You get a rash'] },
        safety: { alcohol: { level: 'unsafe', note: 'Avoid alcohol.' }, driving: { level: 'safe', note: '' } },
        missed_dose: '', interactions: { medicines: [], food: [], conditions: [] }, quick_tips: [],
        facts: { therapeutic_class: 'Analgesic', chemical_class: '', action_class: '', habit_forming: false },
        faqs: [{ question: 'Can I take it with milk?', answer: 'Yes.' }],
        references: [{ source: 'Manufacturer’s package insert', date: 'March 2026' }],
      }), ph]);
  } finally { await c.end(); }
});

const isPhone = (name: string) => name === 'phone';

test('the product page shows the reviewed medicine information and hides empty sections', async ({ page }, info) => {
  await page.goto(`/shop/${P.main}`);
  await expect(page.getByRole('heading', { name: 'E2E Zorvex 650 Tablet' })).toBeVisible();
  await expect(page.getByText('Sch H', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Needs a doctor’s prescription/)).toBeVisible();
  const infoBox = page.getByTestId('medicine-info');
  await expect(infoBox.getByRole('heading', { name: 'About this medicine' })).toBeVisible();
  if (isPhone(info.project.name)) {
    // phones: one accordion per section; the first is open
    await expect(infoBox.locator('summary', { hasText: 'Overview' })).toBeVisible();
    await expect(infoBox.getByText('E2E Zorvex relieves pain and fever.')).toBeVisible();
    await infoBox.locator('summary', { hasText: 'Safety advice' }).click();
  } else {
    // desktop: sticky section tabs
    const tabs = infoBox.getByRole('navigation', { name: 'Medicine information sections' });
    await expect(tabs.getByRole('link', { name: 'Safety advice' })).toBeVisible();
    await expect(tabs.getByRole('link', { name: 'How it works' })).toHaveCount(0);
    await tabs.getByRole('link', { name: 'FAQs' }).click();
    await expect(page).toHaveURL(/#info-faqs$/);
  }
  await expect(infoBox.getByTestId('safety-advice')).toContainText('Unsafe');
  for (const hidden of ['How it works', 'Missed dose', 'Interactions', 'Quick tips']) {
    await expect(infoBox.getByText(hidden, { exact: true })).toHaveCount(0);
  }
  await expect(infoBox.getByTestId('info-reviewed')).toContainText('Reviewed by E2E Pharmacist, Reg. no. E2E-MSPC-33');
  await expect(infoBox.getByTestId('info-reviewed')).toContainText('For information only. Follow your doctor’s advice.');
  await expectNoBrowserStorage(page);
});

test('substitutes: cheapest per tablet first with the saving, the full list, and Add', async ({ page }) => {
  await signIn(page, 'buyer');
  await call('DELETE', '/cart', undefined, await token('buyer'));
  await page.goto(`/shop/${P.main}`);
  const box = page.getByTestId('substitutes');
  await expect(box.getByRole('heading', { name: 'Substitutes' })).toBeVisible();
  const rows = box.getByTestId('substitute-row');
  await expect(rows.first()).toContainText('E2E Zorvaquin 650 mg Tablet');       // ₹1.50 / tablet
  await expect(rows.first()).toContainText('Save 50%');
  await expect(box.getByTestId('substitutes-note')).toContainText('Same medicine, different maker. Ask your doctor or pharmacist before switching.');
  await expect(box.getByRole('link', { name: 'Consult a doctor' })).toHaveAttribute('href', '/consult');
  await page.goto(`/medicine/${P.main}/substitutes`);
  await expect(page.getByRole('heading', { name: 'Substitutes for E2E Zorvex 650 Tablet' })).toBeVisible();
  const all = page.getByTestId('substitutes-all').getByTestId('substitute-row');
  await expect(all).toHaveCount(2);
  await Promise.all([
    page.waitForResponse((r) => /\/cart\/items\//.test(r.url()) && r.request().method() === 'PUT' && r.ok()),
    all.first().getByRole('button', { name: 'Add E2E Zorvaquin 650 mg Tablet to cart' }).click(),
  ]);
  const cart = await call('GET', '/cart', undefined, await token('buyer'));
  expect(cart.json.data.items.map((i: any) => i.product_id)).toEqual([P.sub]);     // only what was added; nothing swapped
  await call('DELETE', '/cart', undefined, await token('buyer'));
});

test('delivery date for a PIN, the supplied batch’s expiry and the cold-chain note', async ({ page }) => {
  await page.goto(`/shop/${P.main}`);
  const box = page.getByTestId('delivery-info');
  await box.getByLabel('Delivery date for your PIN code').fill(PIN);
  await box.getByRole('button', { name: 'Check' }).click();
  await expect(box.getByTestId('delivery-eta')).toContainText(/Get it by (Monday|Tuesday|Wednesday|Thursday|Friday|Saturday), \d{1,2} [A-Z][a-z]{2}/);
  await expect(box.getByTestId('delivery-eta')).toContainText('(estimated)');
  await expect(box.getByTestId('expiry-line')).toHaveText('Expires on or after Mar 2028');
  await expect(box.getByTestId('cold-chain-note')).toHaveCount(0);
  await page.goto(`/shop/${P.cold}`);
  await expect(page.getByTestId('cold-chain-note')).toHaveText(/Delivered in an insulated pack\. Keep refrigerated on arrival\./);
});

test('trust pages are linked from the product page and the footer', async ({ page }, info) => {
  await page.goto(`/shop/${P.main}`);
  await page.getByTestId('product-trust-strip').getByRole('link', { name: 'Genuine medicines' }).click();
  await expect(page).toHaveURL(/\/trust\/genuine-medicines$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Genuine medicines' })).toBeVisible();
  await page.getByRole('navigation', { name: 'More about how we work' }).getByRole('link', { name: 'Expired, damaged and recalled medicines' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Expired, damaged and recalled medicines' })).toBeVisible();
  await expect(page.getByText(/never supply a batch that expires within 30 days/)).toBeVisible();
  await expect(page.getByText('{{')).toHaveCount(0);
  const footer = page.locator('footer');
  await expect(footer.getByRole('link', { name: 'How a pharmacist checks your order' })).toHaveAttribute('href', '/trust/pharmacist-checked');
  if (!isPhone(info.project.name)) await expect(footer.getByRole('link', { name: 'Genuine medicines' })).toBeVisible();
});

test('My medicines: add a reminder, mark today’s dose, then delete it', async ({ page }) => {
  const t = await token('buyer');
  for (const r of (await call('GET', '/reminders', undefined, t)).json.data ?? []) await call('DELETE', `/reminders/${r.id}`, undefined, t);
  await signIn(page, 'buyer');
  await page.goto('/account');
  await page.getByRole('link', { name: 'My medicines (dose reminders)' }).click();
  await expect(page.getByRole('heading', { name: 'My medicines' })).toBeVisible();
  await page.getByRole('button', { name: 'Add a reminder' }).click();
  await page.getByLabel('Medicine', { exact: true }).fill('E2E Vitamin D3');
  await page.getByLabel('Dose (optional)').fill('1 capsule');
  await page.getByRole('button', { name: '+ 8:00 pm' }).click();
  await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/reminders') && r.request().method() === 'POST' && r.ok()),
    page.getByRole('button', { name: 'Save reminder' }).click(),
  ]);
  const card = page.getByTestId('reminder-card').filter({ hasText: 'E2E Vitamin D3' });
  await expect(card).toContainText('1 capsule');
  await expect(card).toContainText('8:00 am, 8:00 pm');
  // today's 8 am dose is always due (taps are taken up to 12 hours ahead): Taken goes to the server
  await Promise.all([
    page.waitForResponse((r) => /\/reminders\/[^/]+\/doses$/.test(r.url()) && r.ok()),
    card.getByRole('button', { name: 'Taken at 8:00 am' }).click(),
  ]);
  await expect(card.getByRole('list', { name: 'Today’s doses' })).toContainText('Taken');
  const saved = (await call('GET', '/reminders', undefined, t)).json.data;
  expect(saved).toHaveLength(1);                                      // on the server, not in the browser
  expect(saved[0].today.find((d: any) => d.time === '08:00').status).toBe('taken');
  page.once('dialog', (d) => d.accept());
  await card.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('No reminders yet.', { exact: false })).toBeVisible();
  await expectNoBrowserStorage(page);
});

test('health profile: consent first, then allergies and a family member', async ({ page }) => {
  const t = await token('buyer');
  await call('DELETE', '/health-profile', undefined, t);
  await signIn(page, 'buyer');
  await page.goto('/account/health');
  await expect(page.getByRole('heading', { name: 'Health profile' })).toBeVisible();
  await page.getByLabel('Allergies (one per line)').first().fill('Penicillin');
  const save = page.getByRole('form', { name: 'Your health details' }).getByRole('button', { name: 'Save' });
  await expect(save).toBeDisabled();                                    // consent is never pre-ticked (C-41)
  await page.getByTestId('health-consent').getByRole('checkbox').check();
  await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/health-profile') && r.request().method() === 'PUT' && r.ok()),
    save.click(),
  ]);
  await expect(page.getByTestId('health-consent')).toHaveCount(0);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  const form = page.getByRole('form', { name: 'Family member' });
  await form.getByLabel('Name', { exact: true }).fill('E2E Asha');
  await form.getByLabel('Relation', { exact: true }).fill('mother');
  await form.getByLabel('Age', { exact: true }).fill('64');
  await form.getByLabel('Allergies (one per line)').fill('Aspirin');
  await form.getByRole('button', { name: 'Save family member' }).click();
  await expect(page.getByTestId('family-member')).toContainText('E2E Asha · mother · 64 years');
  const server = (await call('GET', '/health-profile', undefined, t)).json.data;
  expect(server.allergies).toEqual(['Penicillin']);
  expect(server.family_members[0].allergies).toEqual(['Aspirin']);
  await expectNoBrowserStorage(page);
});

test('the pharmacist sees the buyer’s allergies when checking the prescription', async ({ page }, info) => {
  test.skip(isPhone(info.project.name), 'staff screens are checked on desktop');
  const t = await token('buyer');
  // the buyer's health profile with consent (the previous test may have run on another project)
  await call('PUT', '/health-profile', { consent: true, allergies: ['Penicillin'], conditions: ['Asthma'], current_medicines: [] }, t);
  const addr = (await call('GET', '/users/me/addresses', undefined, t)).json.data[0];
  const order = await call('POST', '/orders', { address_id: addr.id, pincode: PIN, items: [{ product_id: P.main, quantity: 1 }] }, t);
  const o = order.json.data?.order;
  expect(o?.id, JSON.stringify(order.json)).toBeTruthy();
  const c = db();
  await c.connect();
  try {
    await c.query(`UPDATE orders SET status = 'rx_pending' WHERE id = $1`, [o.id]);
    await c.query(`INSERT INTO prescriptions (user_id, order_id, s3_key, file_type, status)
                   SELECT user_id, id, 'prescriptions/e2e-s33.jpg', 'jpg', 'pending' FROM orders WHERE id = $1`, [o.id]);
  } finally { await c.end(); }
  await signIn(page, 'pharmacist');
  await page.goto('/staff/fulfilment');
  const card = page.locator('.card', { hasText: o.order_number });
  await card.getByRole('button', { name: 'Review' }).click();
  const note = page.getByTestId('buyer-health-note');
  await expect(note).toContainText('Health profile — Buyer');
  await expect(note).toContainText('Allergies: Penicillin');
  await expect(note).toContainText('Conditions: Asthma');
});

test('staff write medicine information and a pharmacist approves it (C-19)', async ({ page }, info) => {
  test.skip(isPhone(info.project.name), 'staff screens are checked on desktop');
  await signIn(page, 'admin');
  await page.goto(`/staff/medicine-info/${P.sub}`);
  await expect(page.getByRole('heading', { name: /Medicine information — E2E Zorvaquin 650 mg Tablet/ })).toBeVisible();
  await page.getByLabel('Overview', { exact: true }).fill('E2E Zorvaquin eases pain and fever.');
  await page.getByLabel('Alcohol', { exact: true }).selectOption('caution');
  await page.getByRole('button', { name: 'Add a source' }).click();
  await page.getByLabel('Source 1', { exact: true }).fill('Manufacturer’s package insert');
  await page.getByLabel('Date 1', { exact: true }).fill('April 2026');
  await Promise.all([
    page.waitForResponse((r) => /\/info\/submit$/.test(r.url()) && r.ok()),
    page.getByRole('button', { name: 'Send for pharmacist review' }).click(),
  ]);
  await expect(page.getByTestId('info-status')).toContainText('Waiting for pharmacist review');
  // buyers still see nothing for this product
  const before = await call('GET', `/medicines/${P.sub}/info`);
  expect(before.json.data.available).toBe(false);

  await signIn(page, 'pharmacist');
  await page.goto('/staff/content-review');
  const card = page.getByTestId('info-review-card').filter({ hasText: 'E2E Zorvaquin 650 mg Tablet' });
  await expect(card).toContainText('E2E Zorvaquin eases pain and fever.');
  await card.getByLabel('Review notes').fill('Matches the package insert.');
  await Promise.all([
    page.waitForResponse((r) => /\/info\/review$/.test(r.url()) && r.ok()),
    card.getByRole('button', { name: 'Approve' }).click(),
  ]);
  await page.goto(`/shop/${P.sub}`);
  await expect(page.getByTestId('medicine-info')).toContainText('E2E Zorvaquin eases pain and fever.');
  await expect(page.getByTestId('info-reviewed')).toContainText('Reg. no. E2E-MSPC-33');
  // clean up so the next run starts from nothing
  const c = db();
  await c.connect();
  try { await c.query(`DELETE FROM product_info_versions WHERE product_id = $1`, [P.sub]); } finally { await c.end(); }
});

