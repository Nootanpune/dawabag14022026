// The buyer's side of the two orders that go the whole way: an everyday (OTC)
// medicine on phone and laptop, and a Schedule H medicine with a prescription,
// then the delivery code and the delivered order.
import { Browser } from '@playwright/test';
import { capture } from '../lib/recorder';
import { useFakeCheckout } from '../lib/fakes';
import { token } from '../lib/people';
import { newSession, signIn } from '../lib/steps';
import { samplePrescription } from '../lib/prescription';
import { orderIdOf, orderNumberOnScreen } from '../lib/orders';
import { call } from '../../support/data';
import type { Story } from '../lib/story';

export const C = 'Customer — everyday medicine', R = 'Customer — prescription medicine';

// ── Customer, everyday medicine: phone first, then the same on a laptop ──
export async function customerEveryday(browser: Browser, story: Story) {
  const pid = process.env.E2E_PRODUCT_ID!;
  for (const device of ['phone', 'laptop'] as const) {
    const { ctx, page } = await newSession(browser, device);
    await useFakeCheckout(ctx);
    const shot = (title: string, caption: string, o = {}) => capture(page, { journey: C, role: 'Customer', device, title, caption }, o);
    await page.goto('/');
    await shot('Home page', 'First visit, signed out. Trust badges, search, prescription upload and categories are the first things a visitor sees.');
    await page.getByRole('combobox', { name: /search medicines/i }).first().fill('Paracetamol');
    await page.waitForTimeout(1200);
    await shot('Search', 'Searching by name: suggestions appear under the box as you type, each with its price and an Add button (Enter opens all results).');
    await page.goto(`/shop/${pid}`);
    await shot('Product page', 'Product details and the legally required declarations (C-17). Empty fields are hidden.', { fullPage: device === 'laptop' });
    await signIn(page, 'buyer');
    await shot('Signed in', 'After signing in with mobile and password. The welcome message sits clear of the header.');
    await page.goto(`/shop/${pid}`);
    await page.getByRole('button', { name: /add to cart/i }).first().click();
    await page.waitForTimeout(800);
    await page.goto('/cart');
    await shot('Cart', 'Cart with quantity controls and the delivery charge for the saved PIN code.', { fullPage: device === 'laptop' });
    await page.goto('/checkout');
    await shot('Checkout — address', 'Step 1: choose the delivery address.');
    await page.getByRole('button', { name: /review order/i }).click();
    await page.waitForTimeout(1500);
    await shot('Checkout — review', 'Step 2: full price break-up, return and cancellation terms and policy links before paying (C-35).', { fullPage: true });
    await page.getByRole('button', { name: /place order/i }).click();
    await page.getByRole('button', { name: /pay .* securely/i }).waitFor();
    await shot('Payment', 'Step 3: the order is placed and waits for payment. No cash on delivery; Razorpay handles UPI, cards and net banking.');
    await page.getByRole('button', { name: /pay .* securely/i }).click();
    await page.waitForTimeout(2500);
    const num = await orderNumberOnScreen(page);
    if (device === 'laptop') story.orders.otc = num;
    await shot('Order confirmed', `Paid (test payment through the fake gateway). Order ${num} goes straight to packing.`);
    await page.goto('/orders');
    await shot('My orders', 'The order list, newest first, with status and amount.');
    await ctx.close();
  }
}

// ── Customer, prescription medicine (phone) ──
export async function customerPrescription(browser: Browser, story: Story) {
  const rxId = process.env.E2E_RX_PRODUCT_ID!;
  const device = 'phone' as const;
  const { ctx, page } = await newSession(browser, device);
  await useFakeCheckout(ctx);
  const shot = (title: string, caption: string, o = {}) => capture(page, { journey: R, role: 'Customer', device, title, caption }, o);
  await signIn(page, 'buyer');
  // the cart from earlier is empty after the orders; add the Schedule H medicine
  await page.goto(`/shop/${rxId}`);
  await shot('Prescription medicine', 'A Schedule H medicine carries the Rx badge and the warning that a prescription is needed (C-08).');
  await page.getByRole('button', { name: /add to cart/i }).first().click();
  await page.waitForTimeout(800);
  await page.goto('/cart');
  await shot('Cart with Rx item', 'The cart says a prescription will be asked for at checkout.');
  await page.goto('/checkout');
  await page.getByRole('button', { name: /continue to prescription/i }).click();
  await page.getByRole('heading', { name: 'Prescription needed' }).waitFor();
  await shot('Prescription needed', 'The checkout lists the medicines that need a prescription; nothing is placed until one is chosen (C-08).');
  await page.getByLabel('Prescription file').setInputFiles({ name: 'prescription.png', mimeType: 'image/png', buffer: await samplePrescription(browser) });
  await page.getByText('Chosen').waitFor();
  await shot('Prescription attached', 'The new photo goes only to the server\'s private store and is chosen for this order.');
  await page.getByRole('button', { name: /continue to review/i }).click();
  await page.waitForTimeout(1500);
  await shot('Review with prescription', 'The review names the prescription sent with the order and what happens if the pharmacist cannot accept it.', { fullPage: true });
  await page.getByRole('button', { name: /place order/i }).click();
  await page.getByRole('button', { name: /pay .* securely/i }).waitFor();
  await page.getByRole('button', { name: /pay .* securely/i }).click();
  await page.waitForTimeout(2500);
  story.orders.rx = await orderNumberOnScreen(page);
  await shot('Order confirmed', `Paid. Order ${story.orders.rx} now waits for the pharmacist to check the prescription before anything is packed.`);
  await ctx.close();
}

// ── Customer sees the delivery code (phone) ──
export async function customerOutForDelivery(browser: Browser, story: Story) {
  const device = 'phone' as const;
  const { ctx, page } = await newSession(browser, device);
  await signIn(page, 'buyer');
  const oid = await orderIdOf(story.orders.rx!);
  await page.goto(`/orders/${oid}`);
  let code = (await page.locator('body').innerText()).match(/\b\d{6}\b/)?.[0] ?? '';
  if (!code) code = (await call('GET', `/orders/${oid}`, undefined, await token('buyer'))).json.data?.shipments?.[0]?.handover_code ?? '';
  story.deliveryCode = code;
  await capture(page, { journey: R, role: 'Customer', device, title: 'Out for delivery', caption: 'The order page shows the shipment on its way and the 6-digit delivery code to give the rider (prescription orders, C-26).' }, { fullPage: true });
  await ctx.close();
}

// ── Customer after delivery (phone) ──
export async function customerDelivered(browser: Browser, story: Story) {
  const device = 'phone' as const;
  const { ctx, page } = await newSession(browser, device);
  await signIn(page, 'buyer');
  await page.goto(`/orders/${await orderIdOf(story.orders.rx!)}`);
  await capture(page, { journey: R, role: 'Customer', device, title: 'Delivered', caption: 'Delivered: the tax invoice can be downloaded, and returns or complaints can be raised from here (C-37, C-36).' }, { fullPage: true });
  await ctx.close();
}
