// Sprint 43 — the buyer changes an order before packing (URS-074): lower a quantity or remove
// a medicine on the order page; the server issues the credit note and refund. Once packing
// starts the change is no longer offered.
import { expect, test } from '@playwright/test';
import { signIn } from '../support/helpers';
import { call, db, people, PIN } from '../support/data';

async function tokenOf(who: keyof typeof people) {
  return (await call('POST', '/auth/login', { mobile: people[who].mobile, password: people[who].password })).json.data?.access_token;
}

/** An OTC order placed by the buyer, as payment capture leaves it ('packing', nothing packed). */
async function paidOrder(quantity: number) {
  const t = await tokenOf('buyer');
  const addr = (await call('GET', '/users/me/addresses', undefined, t)).json.data[0];
  const r = await call('POST', '/orders', { address_id: addr.id, pincode: PIN, items: [{ product_id: process.env.E2E_PRODUCT_ID, quantity }] }, t);
  const o = r.json.data?.order;
  expect(o?.id, JSON.stringify(r.json)).toBeTruthy();
  const c = db();
  await c.connect();
  try { await c.query(`UPDATE orders SET status = 'packing' WHERE id = $1`, [o.id]); } finally { await c.end(); }
  return o as { id: string; order_number: string };
}

test('the buyer lowers a quantity before packing and sees the change on the order', async ({ page }) => {
  const o = await paidOrder(3);
  await signIn(page, 'buyer');
  await page.goto(`/orders/${o.id}`);
  await expect(page.getByRole('heading', { name: 'Need less?' })).toBeVisible();
  await page.getByRole('button', { name: 'Change order' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('To add something, place a new order.')).toBeVisible();
  const raise = dialog.getByRole('button', { name: /^Raise quantity of E2E Paracetamol 500 back/ });
  await expect(raise).toBeDisabled();                       // never above what was ordered
  await expect(dialog.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  await dialog.getByRole('button', { name: /^Lower quantity of E2E Paracetamol 500/ }).click();
  await dialog.getByRole('button', { name: /^Lower quantity of E2E Paracetamol 500/ }).click();
  await expect(dialog.getByText('Was 3')).toBeVisible();
  await dialog.getByRole('button', { name: 'Remove' }).click();
  await expect(dialog.getByText('To remove everything, cancel the order instead.')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Keep' }).click();
  await dialog.getByRole('button', { name: /^Lower quantity of E2E Paracetamol 500/ }).click();
  await dialog.getByRole('button', { name: /^Lower quantity of E2E Paracetamol 500/ }).click();
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Your order is changed.')).toBeVisible();
  await expect(page.getByText(/Qty: 1/)).toBeVisible();
  await expect(page.getByText('(was 3)')).toBeVisible();
  const changes = page.locator('.card', { hasText: 'Changes you made' });
  await expect(changes).toContainText('E2E Paracetamol 500: 3 → 1');
  // The credit note is listed in plain words
  await expect(page.locator('.card', { hasText: 'Credit notes' })).toContainText('order changed before packing');

  // The server agrees: invoiced 3, 2 taken off; raising it back is refused
  const t = await tokenOf('buyer');
  const d = (await call('GET', `/orders/${o.id}`, undefined, t)).json.data;
  expect(d.items[0]).toMatchObject({ quantity: 3, removed_qty: 2, supply_qty: 1 });
  const up = await call('POST', `/orders/${o.id}/edit`, { lines: [{ order_item_id: d.items[0].id, quantity: 2 }] }, t);
  expect(up.status).toBe(422);
  expect(up.json.code).toBe('ORDER_EDIT_INCREASE_NOT_SUPPORTED');
});

test('once packing starts the change is no longer offered', async ({ page }) => {
  const o = await paidOrder(2);
  const c = db();
  await c.connect();
  try {
    await c.query("SET ROLE dawabag_maintenance; SET dawabag.maintenance = 'on'");
    await c.query(`UPDATE order_shipments SET status = 'packed' WHERE order_id = $1`, [o.id]);
  } finally { await c.end(); }
  await signIn(page, 'buyer');
  await page.goto(`/orders/${o.id}`);
  await expect(page.getByText(o.order_number).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Change order' })).toHaveCount(0);
});
