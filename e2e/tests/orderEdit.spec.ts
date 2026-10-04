// Sprint 44 (owner decision 2026-10-03) — the buyer changes an order before our pharmacist
// approves it: lower, raise, add a medicine (searching the catalogue), a prescription for an added
// prescription medicine, the difference to pay; once the pharmacist approves (the invoice is
// issued then) the change is no longer offered.
import { expect, test } from '@playwright/test';
import { signIn } from '../support/helpers';
import { call, db, people, PIN } from '../support/data';

async function tokenOf(who: keyof typeof people) {
  return (await call('POST', '/auth/login', { mobile: people[who].mobile, password: people[who].password })).json.data?.access_token;
}

/** An OTC order placed by the buyer, as payment capture leaves it ('packing', not yet approved, no invoice). */
async function paidOrder(quantity: number) {
  const t = await tokenOf('buyer');
  const addr = (await call('GET', '/users/me/addresses', undefined, t)).json.data[0];
  const r = await call('POST', '/orders', { address_id: addr.id, pincode: PIN, items: [{ product_id: process.env.E2E_PRODUCT_ID, quantity }] }, t);
  const o = r.json.data?.order;
  expect(o?.id, JSON.stringify(r.json)).toBeTruthy();
  const c = db();
  await c.connect();
  try {
    await c.query(`INSERT INTO payments (order_id, gateway, gateway_order_id, gateway_payment_id, status, amount_paise, paid_at, captured_at, method)
                   VALUES ($1, 'razorpay', $2, $3, 'captured', $4, NOW(), NOW(), 'upi')`, [o.id, `order_e2e44_${Date.now()}`, `pay_e2e44_${Date.now()}`, o.total_paise]);
    await c.query(`UPDATE orders SET status = 'packing' WHERE id = $1`, [o.id]);
  } finally { await c.end(); }
  return o as { id: string; order_number: string };
}

test('before approval the buyer raises a quantity and adds a medicine, then is asked to pay the difference', async ({ page }) => {
  const o = await paidOrder(1);
  await signIn(page, 'buyer');
  await page.goto(`/orders/${o.id}`);
  await expect(page.getByTestId('invoice-note')).toHaveText('The tax invoice is issued when our pharmacist approves the order.');
  await expect(page.getByRole('heading', { name: 'Need to change something?' })).toBeVisible();
  await page.getByRole('button', { name: 'Change order' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/you can lower, remove or raise a quantity, or add a medicine/)).toBeVisible();
  await dialog.getByRole('button', { name: /^Raise quantity of E2E Paracetamol 500/ }).click();
  await expect(dialog.getByText('Was 1')).toBeVisible();
  await dialog.getByRole('textbox', { name: 'Search medicines to add' }).fill('amoxicillin');
  await dialog.getByRole('button', { name: 'Add E2E Amoxicillin 500' }).click();
  await expect(dialog.getByTestId('edit-added')).toContainText('E2E Amoxicillin 500');
  // A prescription medicine: the dialog asks for a prescription before saving (C-08)
  await expect(dialog.getByRole('heading', { name: /Prescription needed for E2E Amoxicillin 500/ })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Remove' }).last().click();     // take the prescription medicine off again
  await expect(dialog.getByRole('heading', { name: /Prescription needed/ })).toHaveCount(0);
  await dialog.getByRole('textbox', { name: 'Search medicines to add' }).fill('paracetamol');
  // Already on the order: not offered to add (change its quantity instead). Sprint 48: checked by the
  // button itself, so other paracetamol products in a shared dev database (e.g. trial demo items) do not matter
  await expect(dialog.getByRole('button', { name: 'Add E2E Paracetamol 500' })).toHaveCount(0);
  await expect(dialog.getByText(/No medicine found to add\.|Add /).first()).toBeVisible();
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(/Your order is changed\. Please pay the difference of ₹/)).toBeVisible();
  const due = page.getByTestId('extra-payment');
  await expect(due).toContainText('Pay the difference for your change');
  await expect(due).toContainText('Our pharmacist approves the order once it is paid.');
  await expect(page.locator('.card', { hasText: 'Changes you made' })).toContainText('E2E Paracetamol 500: 1 → 2');

  // The server agrees: the line is 2 now and the pharmacist cannot approve before the difference is paid
  const t = await tokenOf('buyer');
  const d = (await call('GET', `/orders/${o.id}`, undefined, t)).json.data;
  expect(d.items[0]).toMatchObject({ quantity: 2 });
  expect(d.extra_payment?.status).toBe('awaiting_payment');
  const ph = await tokenOf('pharmacist');
  const r = await call('POST', `/fulfilment/shipments/${d.shipments[0].id}/check`, { decision: 'release' }, ph);
  expect(r.json.code).toBe('EXTRA_PAYMENT_PENDING');
});

test('adding a prescription medicine needs a prescription and goes back to the pharmacist', async ({ page }) => {
  const o = await paidOrder(1);
  const c = db();
  await c.connect();
  try {
    await c.query(`INSERT INTO prescriptions (user_id, s3_key, original_filename, file_type, status)
                   SELECT id, 'prescriptions/e2e-s44.jpg', 'rx44.jpg', 'jpg', 'pending' FROM users WHERE mobile = $1`, [people.buyer.mobile]);
  } finally { await c.end(); }
  await signIn(page, 'buyer');
  await page.goto(`/orders/${o.id}`);
  await page.getByRole('button', { name: 'Change order' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Search medicines to add' }).fill('amoxicillin');
  await dialog.getByRole('button', { name: 'Add E2E Amoxicillin 500' }).click();
  await dialog.getByRole('radio', { name: /Prescription photo/ }).first().click();
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText(/Our pharmacist will check the prescription for what you added/)).toBeVisible();
  await expect(page.locator('.card', { hasText: 'Changes you made' })).toContainText('Sent back to our pharmacist for the prescription check.');
  const t = await tokenOf('buyer');
  const d = (await call('GET', `/orders/${o.id}`, undefined, t)).json.data;
  expect(d.status).toBe('rx_pending');
  expect(d.items.some((i: any) => i.product_name === 'E2E Amoxicillin 500')).toBe(true);
});

test('once the pharmacist approves (invoice issued) the change is no longer offered', async ({ page }) => {
  const o = await paidOrder(2);
  const ph = await tokenOf('pharmacist');
  const t = await tokenOf('buyer');
  const d = (await call('GET', `/orders/${o.id}`, undefined, t)).json.data;
  const rel = await call('POST', `/fulfilment/shipments/${d.shipments[0].id}/check`, { decision: 'release' }, ph);
  expect(rel.status, JSON.stringify(rel.json)).toBe(200);
  await signIn(page, 'buyer');
  await page.goto(`/orders/${o.id}`);
  await expect(page.getByText(o.order_number).first()).toBeVisible();
  await expect(page.getByText(/Invoice DWB\//).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Change order' })).toHaveCount(0);
  const up = await call('POST', `/orders/${o.id}/edit`, { lines: [{ order_item_id: d.items[0].id, quantity: 1 }] }, t);
  expect(up.status).toBe(409);
  expect(up.json.message).toBe('The invoice has been issued; you can cancel or return instead.');
});
