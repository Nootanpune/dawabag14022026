// Partner pharmacy, part 2: a buyer's order is filled by the partner (nearest
// seller with stock), the partner seals and dispatches it under its own invoice,
// marks it delivered, and is paid through a settlement net of commission, fees,
// TCS and TDS (C-05, C-13, C-26, C-32).
import { Browser } from '@playwright/test';
import { shooter } from '../lib/recorder';
import { useFakeCheckout } from '../lib/fakes';
import { apiAs } from '../lib/people';
import { dialog, newSession, onScreenOr, signIn } from '../lib/steps';
import { dbRow, orderIdOf, orderNumberOnScreen, shipmentsOf } from '../lib/orders';
import { todayIST } from '../lib/time';
import type { Story } from '../lib/story';
import { ORS, PART, PARTNER } from './partnerOnboarding';

export async function partnerOrder(browser: Browser, story: Story) {
  const productId = (await dbRow(`SELECT id FROM products WHERE sku = $1`, [ORS.sku]))!.id;

  // ── The buyer orders on the phone, as usual ──
  const buyer = await newSession(browser, 'phone');
  await useFakeCheckout(buyer.ctx);
  const buyerShot = shooter(buyer.page, PART, 'Customer', 'phone');
  await signIn(buyer.page, 'buyer');
  await buyer.page.goto(`/shop/${productId}`);
  await buyer.page.getByRole('button', { name: /add to cart/i }).first().click();
  await buyer.page.waitForTimeout(800);
  await buyer.page.goto('/cart');
  // Ten sachets: a small order (under the own-stock-first value) that still leaves the partner a positive settlement
  for (let i = 1; i < 10; i++) {
    await buyer.page.getByRole('button', { name: 'Increase quantity' }).first().click();
    await buyer.page.waitForTimeout(500);
  }
  await buyerShot('Cart', `Ten sachets of ${ORS.name}. The buyer sees the same catalogue and price whoever ends up supplying it.`);
  await buyer.page.goto('/checkout');
  await buyer.page.getByRole('button', { name: /review order/i }).click();
  await buyer.page.waitForTimeout(1500);
  await buyer.page.getByRole('button', { name: /place order/i }).click();
  await buyer.page.getByRole('button', { name: /pay .* securely/i }).click();
  await buyer.page.waitForTimeout(2500);
  story.orders.partner = await orderNumberOnScreen(buyer.page);
  await buyerShot('Order paid', `The buyer orders and pays exactly as before; order ${story.orders.partner} is placed with the pharmacy nearest to the buyer that has the stock.`);
  await buyer.page.goto(`/orders/${await orderIdOf(story.orders.partner)}`);
  await buyerShot('Sold by the partner', `The order page names ${PARTNER.name} as the seller, with its own invoice number (C-05, C-13).`, { fullPage: true });

  // ── The partner sends it from its own shop ──
  const part = await newSession(browser, 'laptop');
  const partShot = shooter(part.page, PART, 'Partner', 'laptop');
  await signIn(part.page, 'partner');
  await part.page.goto('/partner/shipments');
  const card = part.page.locator('div.card', { hasText: story.orders.partner });
  await card.first().waitFor();
  await partShot('Shipment to send', 'Paid orders for the partner: where to send them, what to pack, the batch and expiry, and the invoice in the partner\'s own series to print.', { fullPage: true });
  const [sid] = await shipmentsOf(story.orders.partner);
  // Sprint 35: the partner's own registered pharmacist checks and releases it first (C-08)
  const vendor = (await dbRow(`SELECT id FROM vendors WHERE name = $1`, [PARTNER.name]))!.id;
  const vp = (await dbRow(`SELECT id FROM vendor_pharmacists WHERE vendor_id = $1 AND is_active LIMIT 1`, [vendor]))?.id
    ?? (await dbRow(`INSERT INTO vendor_pharmacists (vendor_id, full_name, registration_no) VALUES ($1, 'E2E Meera Joshi', 'E2E-MSPC-0042') RETURNING id`, [vendor]))!.id;
  let note = await onScreenOr(async () => {
    await card.getByRole('button', { name: 'Pharmacist check' }).click();
    const d = dialog(part.page);
    await d.getByLabel('Registered pharmacist who checked it').selectOption({ index: 1 });
    await d.getByRole('checkbox').check();
    await partShot('Pharmacist check', 'Before packing, the partner\'s own registered pharmacist checks the medicines and quantities and releases the shipment; their name and registration number are recorded (C-08).');
    await d.getByRole('button', { name: 'Release for packing' }).click();
    await d.waitFor({ state: 'detached' });
  }, () => apiAs('partner', 'POST', `/partner/shipments/${sid}/check`, { decision: 'release', vendor_pharmacist_id: vp }), part.page);
  note = await onScreenOr(async () => {
    await card.getByRole('button', { name: 'Dispatch' }).click();
    const d = dialog(part.page);
    await d.getByLabel('Courier').fill('Shree Maruti Courier');
    await d.getByLabel('AWB / tracking number').fill('SMC4412078');
    await d.getByLabel('Seal number').fill('SEAL-LRP-0001');
    await partShot('Seal and dispatch', 'The pack is closed with a tamper-evident seal; the courier, tracking number and seal number are recorded (C-26).');
    await d.getByRole('button', { name: 'Mark dispatched' }).click();
    await d.waitFor({ state: 'detached' });
  }, () => apiAs('partner', 'POST', `/partner/shipments/${sid}/dispatch`, { courier_partner: 'Shree Maruti Courier', awb_number: 'SMC4412078', seal_number: 'SEAL-LRP-0001' }), part.page) ?? note;
  await part.page.getByRole('button', { name: 'Dispatched', exact: true }).click();
  await partShot('Dispatched', 'On its way; the buyer is told and can track it with the courier.', { note });
  note = await onScreenOr(async () => {
    await part.page.locator('div.card', { hasText: story.orders.partner }).getByRole('button', { name: 'Mark delivered' }).click();
    const d = dialog(part.page);
    await d.getByLabel('Received by (name)').fill('E2E Buyer');
    await d.getByLabel('Relation to buyer').selectOption({ index: 1 });
    await d.getByRole('button', { name: 'Confirm delivery' }).click();
    await d.waitFor({ state: 'detached' });
  }, () => apiAs('partner', 'POST', `/partner/shipments/${sid}/delivered`, { received_by_name: 'E2E Buyer', received_by_relation: 'self' }), part.page);
  await part.page.getByRole('button', { name: 'Delivered', exact: true }).click();
  await partShot('Delivered', 'The courier confirms delivery and the partner records who received it.', { note });

  // ── Dawabag settles with the partner ──
  const admin = await newSession(browser, 'laptop');
  const adminShot = shooter(admin.page, PART, 'Admin', 'laptop');
  await signIn(admin.page, 'admin');
  await admin.page.goto('/admin/settlements');
  // The period covers yesterday too: deliveries are dated in the database's own day
  const from = todayIST(new Date(Date.now() - 86400e3)), to = todayIST();
  note = await onScreenOr(async () => {
    await admin.page.getByLabel('From', { exact: true }).fill(from);
    await admin.page.getByLabel('To', { exact: true }).fill(to);
    await admin.page.getByRole('button', { name: 'Generate' }).click();
    await admin.page.getByText(/batch\(es\) generated · net ₹\d/).waitFor();   // the total, never ₹NaN
  }, () => apiAs('admin', 'POST', '/admin/settlements/generate', { period_from: from, period_to: to }), admin.page);
  await admin.page.locator('tr', { hasText: PARTNER.name }).first().waitFor();
  await adminShot('Settlement generated', 'Delivered partner sales for the period are settled in one batch: the sale value less Dawabag\'s commission and finding fee (with GST) and the TCS and TDS Dawabag must deduct (C-32).', { note });
  await admin.ctx.close();

  await part.page.goto('/partner/settlements');
  await partShot('Partner settlements', 'The partner sees each settlement with what it covers and whether it has been paid.');
  await part.page.locator('a[href^="/partner/settlements/"]').first().click();
  await part.page.waitForURL(/\/partner\/settlements\/.+/);
  await partShot('Settlement detail', 'The break-up line by line, with Dawabag\'s commission invoice number, so the partner can reconcile it with its books.', { fullPage: true });
  await part.ctx.close();
  await buyer.ctx.close();
}
