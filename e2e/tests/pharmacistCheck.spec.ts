// Sprint 35 — a registered pharmacist checks and releases EVERY order before packing
// (owner decision 2026-10-02, C-08): the pharmacist's check queue, the pack button
// blocked until release (the server refuses too), and "Checked by pharmacist" for the buyer.
import { expect, test } from '@playwright/test';
import { signIn } from '../support/helpers';
import { call, db, people, PIN } from '../support/data';

async function tokenOf(who: keyof typeof people) {
  return (await call('POST', '/auth/login', { mobile: people[who].mobile, password: people[who].password })).json.data?.access_token;
}

/** An OTC order placed by the buyer and paid (as payment capture leaves it: 'packing'). */
async function paidOtcOrder() {
  const t = await tokenOf('buyer');
  const addr = (await call('GET', '/users/me/addresses', undefined, t)).json.data[0];
  const r = await call('POST', '/orders', { address_id: addr.id, pincode: PIN, items: [{ product_id: process.env.E2E_PRODUCT_ID, quantity: 2 }] }, t);
  const o = r.json.data?.order;
  expect(o?.id, JSON.stringify(r.json)).toBeTruthy();
  const c = db();
  await c.connect();
  try {
    await c.query(`UPDATE orders SET status = 'packing' WHERE id = $1`, [o.id]);
    // the pharmacist needs a council registration number to release orders
    await c.query(`UPDATE users SET pharmacist_reg_no = COALESCE(pharmacist_reg_no, 'E2E-MSPC-1903') WHERE mobile = $1`, [people.pharmacist.mobile]);
  } finally { await c.end(); }
  return o as { id: string; order_number: string };
}

test('the pharmacist holds, then releases an order; packing is blocked until then', async ({ browser }) => {
  test.setTimeout(90_000);
  const o = await paidOtcOrder();
  const ph = await (await browser.newContext()).newPage();
  const admin = await (await browser.newContext()).newPage();

  // The pharmacist's check queue
  await signIn(ph, 'pharmacist');
  await ph.goto('/staff/fulfilment');
  await expect(ph.getByRole('button', { name: 'Pharmacist check' })).toBeVisible();
  await expect(ph.getByRole('heading', { name: 'Orders to check before packing' })).toBeVisible();
  const card = ph.getByTestId('check-card').filter({ hasText: o.order_number });
  await expect(card).toContainText('E2E Paracetamol 500');
  await card.getByRole('button', { name: 'Check order' }).click();
  const dialog = ph.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: `Pharmacist check — ${o.order_number}` })).toBeVisible();
  await expect(dialog.getByTestId('check-signals')).toBeVisible();
  await dialog.getByRole('button', { name: 'Put on hold' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Write why the order is on hold');
  await dialog.getByLabel('Reason (needed to hold or not supply)').fill('Calling the buyer about the dose');
  await dialog.getByRole('button', { name: 'Put on hold' }).click();
  await expect(dialog).toBeHidden();
  await expect(card).toContainText('On hold');

  // The pack button is blocked, with the reason (an admin may pack; the server refuses too)
  await signIn(admin, 'admin');
  await admin.goto('/staff/fulfilment');
  await admin.getByRole('button', { name: 'Pack', exact: true }).click();
  const packCard = admin.locator('.card', { hasText: o.order_number });
  await expect(packCard.getByTestId('pack-blocked')).toContainText('On hold by the pharmacist: Calling the buyer about the dose');
  await expect(packCard.getByRole('button', { name: 'Mark packed' })).toBeDisabled();
  const sid = (await call('GET', `/orders/${o.id}`, undefined, await tokenOf('admin'))).json.data.shipments[0].id;
  const refused = await call('POST', `/fulfilment/shipments/${sid}/pack`, undefined, await tokenOf('admin'));
  expect(refused.status).toBe(409);

  // Released → packable
  await card.getByRole('button', { name: 'Check order' }).click();
  await ph.getByRole('dialog').getByRole('button', { name: 'Release for packing' }).click();
  await expect(card).toHaveCount(0);
  await admin.reload();
  await admin.getByRole('button', { name: 'Pack', exact: true }).click();
  await expect(packCard).toContainText('Checked by pharmacist E2E Pharmacist, Reg. no.');
  await expect(packCard.getByRole('button', { name: 'Mark packed' })).toBeEnabled();
  await packCard.getByRole('button', { name: 'Mark packed' }).click();
  await expect(admin.locator('.card', { hasText: o.order_number })).toHaveCount(0);
});

test('the buyer sees the pharmacist check on the order timeline', async ({ page }) => {
  const o = await paidOtcOrder();
  await signIn(page, 'buyer');
  await page.goto(`/orders/${o.id}`);
  const step = page.getByRole('listitem').filter({ hasText: /^Pharmacist check/ });
  await expect(step).toContainText('in progress');
  await expect(page.getByText('A registered pharmacist checks every order before it is packed.')).toBeVisible();
  const sid = (await call('GET', `/orders/${o.id}`, undefined, await tokenOf('buyer'))).json.data.shipments[0].id;
  const r = await call('POST', `/fulfilment/shipments/${sid}/check`, { decision: 'release' }, await tokenOf('pharmacist'));
  expect(r.status, JSON.stringify(r.json)).toBe(200);
  await page.reload();
  await expect(page.getByTestId('checked-by')).toContainText('Checked by pharmacist E2E Pharmacist, Reg. no.');
});

test('a refused order shows the buyer the refusal reason, never the staff-only hold note (Sprint 35/36)', async ({ page }) => {
  const o = await paidOtcOrder();
  const ph = await tokenOf('pharmacist');
  const sid = (await call('GET', `/orders/${o.id}`, undefined, await tokenOf('buyer'))).json.data.shipments[0].id;
  let r = await call('POST', `/fulfilment/shipments/${sid}/check`, { decision: 'hold', reason: 'Staff only: ring the buyer first' }, ph);
  expect(r.status, JSON.stringify(r.json)).toBe(200);
  r = await call('POST', `/fulfilment/shipments/${sid}/check`, { decision: 'reject', reason: 'The quantity is more than is safe without a prescription' }, ph);
  expect(r.status, JSON.stringify(r.json)).toBe(200);
  const detail = (await call('GET', `/orders/${o.id}`, undefined, await tokenOf('buyer'))).json.data;
  expect(detail.cancellation_reason).toContain('The quantity is more than is safe without a prescription');
  expect(JSON.stringify(detail)).not.toContain('Staff only: ring the buyer first');
  await signIn(page, 'buyer');
  await page.goto(`/orders/${o.id}`);
  const card = page.getByTestId('refused-order');
  await expect(card).toContainText('Not supplied after the pharmacist’s check');
  await expect(card).toContainText('Reason: The quantity is more than is safe without a prescription');
  await expect(card).toContainText('refunded the way you paid');
  await expect(page.getByText('Staff only: ring the buyer first')).toHaveCount(0);
});
