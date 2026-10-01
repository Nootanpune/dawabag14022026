// R2 rehearsal: records every role's journey, step by step, on phone and laptop,
// against the running API and website with fake payment and storage providers.
// One test order of each kind goes the whole way: buyer → pharmacist → packer →
// rider → buyer. Run: see journeys/README.md.
import { test } from '@playwright/test';
import { capture, writeManifest } from './lib/recorder';
import { startFakeProviders, useFakeCheckout } from './lib/fakes';
import { setUpStaff, token } from './lib/people';
import { newSession, onScreenOr, signIn } from './lib/steps';
import { samplePrescription } from './lib/prescription';
import { call, db } from '../support/data';
import { todayIST } from './lib/time';

test.setTimeout(10 * 60_000);

const C = 'Customer — everyday medicine', R = 'Customer — prescription medicine';
const shipmentsOf = async (orderNumber: string) => {
  const c = db(); await c.connect();
  try {
    return (await c.query(`SELECT s.id FROM order_shipments s JOIN orders o ON o.id = s.order_id WHERE o.order_number = $1`, [orderNumber])).rows.map((r) => r.id as string);
  } finally { await c.end(); }
};
const orderNumberOnScreen = async (page: import('@playwright/test').Page) =>
  (await page.locator('body').innerText()).match(/DWB-[A-Z0-9-]+/)?.[0] ?? '';

test('record every journey', async ({ browser }) => {
  await startFakeProviders();
  await setUpStaff();
  const pid = process.env.E2E_PRODUCT_ID!, rxId = process.env.E2E_RX_PRODUCT_ID!;
  const orders: { otc?: string; rx?: string } = {};

  // ── Customer, everyday medicine: phone first, then the same on a laptop ──
  for (const device of ['phone', 'laptop'] as const) {
    const { ctx, page } = await newSession(browser, device);
    await useFakeCheckout(ctx);
    const shot = (title: string, caption: string, o = {}) => capture(page, { journey: C, role: 'Customer', device, title, caption }, o);
    await page.goto('/');
    await shot('Home page', 'First visit, signed out. Trust badges, search, prescription upload and categories are the first things a visitor sees.');
    await page.getByRole('searchbox').or(page.getByLabel(/search medicines/i)).first().fill('Paracetamol');
    await page.waitForTimeout(1200);
    await shot('Search', 'Searching by name. Results show price, MRP and discount; products without photos get a placeholder with the initial and dosage form.');
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
    if (device === 'laptop') orders.otc = num;
    await shot('Order confirmed', `Paid (test payment through the fake gateway). Order ${num} goes straight to packing.`);
    await page.goto('/orders');
    await shot('My orders', 'The order list, newest first, with status and amount.');
    await ctx.close();
  }

  // ── Customer, prescription medicine (phone) ──
  {
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
    await page.getByRole('button', { name: /review order/i }).click();
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: /place order/i }).click();
    await page.getByRole('button', { name: /continue to payment/i }).waitFor();
    await shot('Prescription needed', 'Payment is not offered until a prescription is attached (C-08).');
    await page.locator('input[type=file]').setInputFiles({ name: 'prescription.png', mimeType: 'image/png', buffer: await samplePrescription(browser) });
    await shot('Prescription attached', 'The buyer attaches a photo of the prescription; it goes only to the server\'s private store.');
    await page.getByRole('button', { name: /continue to payment/i }).click();
    await page.getByRole('button', { name: /pay .* securely/i }).waitFor();
    await page.getByRole('button', { name: /pay .* securely/i }).click();
    await page.waitForTimeout(2500);
    orders.rx = await orderNumberOnScreen(page);
    await shot('Order confirmed', `Paid. Order ${orders.rx} now waits for the pharmacist to check the prescription before anything is packed.`);
    await ctx.close();
  }

  // ── Pharmacist: check the prescription (laptop) ──
  {
    const device = 'laptop' as const;
    const { ctx, page } = await newSession(browser, device);
    const shot = (title: string, caption: string, o = {}) => capture(page, { journey: 'Pharmacist', role: 'Pharmacist', device, title, caption }, o);
    await signIn(page, 'pharmacist');
    await page.goto('/staff/fulfilment');
    await shot('Prescription queue', 'The pharmacist lands on the Rx verify queue: orders waiting for a prescription check, oldest first.');
    let note: string | undefined;
    await page.getByRole('button', { name: 'Review', exact: true }).first().click();
    await page.waitForTimeout(1200);
    await shot('Prescription and form', 'The uploaded prescription beside the form: doctor, registration number, date, patient and prescribed quantity (C-08, C-09).', { fullPage: true });
    note = await onScreenOr(async () => {
      await page.getByLabel('Prescriber (doctor) name').fill('Dr. Asha Kulkarni');
      await page.getByLabel('Prescriber registration no.').fill('MMC-2011-4455');
      await page.getByLabel('Prescription date').fill(todayIST());
      await page.getByLabel('Patient name').fill('E2E Buyer');
      const qty = page.locator('table input').first();
      if (await qty.count()) await qty.fill('10');
      await shot('Form filled', 'Details copied from the prescription.', { fullPage: true });
      await page.getByRole('button', { name: /verify prescription/i }).click();
      await page.getByRole('button', { name: /verify prescription/i }).waitFor({ state: 'detached', timeout: 8000 });
    }, async () => {
      const c = db(); await c.connect();
      const rx = (await c.query(`SELECT p.id FROM prescriptions p JOIN orders o ON o.id = p.order_id WHERE o.order_number = $1`, [orders.rx])).rows[0].id;
      await c.end();
      const r = await call('POST', `/fulfilment/prescriptions/${rx}/verify`, { prescriber_name: 'Dr. Asha Kulkarni', prescriber_reg_no: 'MMC-2011-4455',
        prescribed_on: todayIST(), patient_name: 'E2E Buyer', valid_days: 90, items: [{ product_id: rxId, prescribed_qty: 10 }] }, await token('pharmacist'));
      if (r.status >= 300) throw new Error(JSON.stringify(r.json));
    });
    await page.reload();
    await capture(page, { journey: 'Pharmacist', role: 'Pharmacist', device, title: 'Verified', caption: 'Verified. The order leaves the queue and moves to packing; the check is recorded against the pharmacist\'s registration.', note });
    await ctx.close();
  }

  // ── Packer: pack and hand to a rider (laptop) ──
  {
    const device = 'laptop' as const;
    const { ctx, page } = await newSession(browser, device);
    const shot = (title: string, caption: string, o: { note?: string; fullPage?: boolean } = {}) =>
      capture(page, { journey: 'Packer', role: 'Packer', device, title, caption, note: o.note }, o);
    await signIn(page, 'packer');
    await page.goto('/staff/fulfilment');
    await shot('Pack queue', 'The packer sees paid orders ready to pack, with product, quantity, batch and expiry for each line (FEFO).', { fullPage: true });
    for (const num of [orders.rx!, orders.otc!]) {
      const [sid] = await shipmentsOf(num);
      const note = await onScreenOr(async () => {
        const card = page.locator('div', { hasText: num }).filter({ has: page.getByRole('button', { name: 'Mark packed' }) }).last();
        await card.getByRole('button', { name: 'Mark packed' }).click();
        await page.waitForTimeout(1200);
      }, async () => { const r = await call('POST', `/fulfilment/shipments/${sid}/pack`, undefined, await token('packer')); if (r.status >= 300) throw new Error(JSON.stringify(r.json)); });
      if (num === orders.rx) await shot('Packed', `Order ${num} packed; stock is taken from the batch shown.`, { note });
    }
    await page.getByRole('tab', { name: /dispatch/i }).or(page.getByRole('button', { name: /^dispatch/i })).first().click();
    await page.waitForTimeout(1000);
    await shot('Dispatch queue', 'Packed parcels waiting to leave, each needing a tamper-evident seal number.');
    for (const [i, num] of [orders.rx!, orders.otc!].entries()) {
      const [sid] = await shipmentsOf(num);
      const note = await onScreenOr(async () => {
        const card = page.locator('div', { hasText: num }).filter({ has: page.getByRole('button', { name: 'Dispatch', exact: true }) }).last();
        await card.getByRole('button', { name: 'Dispatch', exact: true }).click();
        await page.getByLabel('Our rider').check();
        await page.getByLabel('Rider').selectOption({ label: /Journey Rider/ as any }).catch(async () => page.getByLabel('Rider').selectOption({ index: 1 }));
        await page.locator('input.font-mono').fill(`SEAL-R2-${i + 1}`);
        if (i === 0) await shot('Dispatch to our rider', 'Choosing our own rider (or a courier with AWB) and recording the seal number (C-26).');
        await page.getByRole('button', { name: 'Mark dispatched' }).click();
        await page.waitForTimeout(1500);
      }, async () => {
        const c = db(); await c.connect();
        const rider = (await c.query(`SELECT id FROM users WHERE mobile = '9000001905'`)).rows[0].id; await c.end();
        const r = await call('POST', `/fulfilment/shipments/${sid}/dispatch`, { rider_id: rider, seal_number: `SEAL-R2-${i + 1}` }, await token('packer'));
        if (r.status >= 300) throw new Error(JSON.stringify(r.json));
      });
      if (i === 1) await shot('Dispatched', 'Both parcels are out with the rider; buyers are notified.', { note });
    }
    await ctx.close();
  }

  // ── Customer sees the delivery code (phone) ──
  let code = '';
  {
    const device = 'phone' as const;
    const { ctx, page } = await newSession(browser, device);
    await signIn(page, 'buyer');
    const c = db(); await c.connect();
    const oid = (await c.query(`SELECT id FROM orders WHERE order_number = $1`, [orders.rx])).rows[0].id; await c.end();
    await page.goto(`/orders/${oid}`);
    code = (await page.locator('body').innerText()).match(/\b\d{6}\b/)?.[0] ?? '';
    if (!code) code = (await call('GET', `/orders/${oid}`, undefined, await token('buyer'))).json.data?.shipments?.[0]?.handover_code ?? '';
    await capture(page, { journey: R, role: 'Customer', device, title: 'Out for delivery', caption: 'The order page shows the shipment on its way and the 6-digit delivery code to give the rider (prescription orders, C-26).' }, { fullPage: true });
    await ctx.close();
  }

  // ── Rider: run sheet and handover (phone) ──
  {
    const device = 'phone' as const;
    const { ctx, page } = await newSession(browser, device);
    const shot = (title: string, caption: string, o: { note?: string; fullPage?: boolean } = {}) =>
      capture(page, { journey: 'Rider', role: 'Rider', device, title, caption, note: o.note }, o);
    await signIn(page, 'rider');
    await page.goto('/staff/run-sheet');
    await shot('Run sheet', 'The rider\'s stops: address, contact, seal number and whether a code is needed — never which medicines are inside (C-41).', { fullPage: true });
    for (const [i, num] of [orders.rx!, orders.otc!].entries()) {
      const [sid] = await shipmentsOf(num);
      const note = await onScreenOr(async () => {
        const card = page.locator('div', { hasText: num }).filter({ has: page.getByRole('button', { name: 'Mark delivered' }) }).last();
        await card.getByRole('button', { name: 'Mark delivered' }).click();
        if (i === 0) await page.getByLabel('Delivery code').fill(code);
        await page.getByLabel('Received by (name)').fill('E2E Buyer');
        await page.getByLabel('Relation to buyer').selectOption({ index: 1 });
        if (i === 0) await shot('Handover', 'At the door: the buyer reads out the delivery code; the rider records who received the parcel.');
        await page.getByRole('button', { name: 'Confirm delivery' }).click();
        await page.waitForTimeout(1500);
      }, async () => {
        const r = await call('POST', `/fulfilment/shipments/${sid}/delivered`, { received_by_name: 'E2E Buyer', received_by_relation: 'self', ...(i === 0 ? { code } : {}) }, await token('rider'));
        if (r.status >= 300) throw new Error(JSON.stringify(r.json));
      });
      if (i === 1) await shot('Run complete', 'Both parcels delivered; the run sheet is empty.', { note });
    }
    await ctx.close();
  }

  // ── Customer after delivery (phone) ──
  {
    const device = 'phone' as const;
    const { ctx, page } = await newSession(browser, device);
    await signIn(page, 'buyer');
    const c = db(); await c.connect();
    const oid = (await c.query(`SELECT id FROM orders WHERE order_number = $1`, [orders.rx])).rows[0].id; await c.end();
    await page.goto(`/orders/${oid}`);
    await capture(page, { journey: R, role: 'Customer', device, title: 'Delivered', caption: 'Delivered: the tax invoice can be downloaded, and returns or complaints can be raised from here (C-37, C-36).' }, { fullPage: true });
    await ctx.close();
  }

  // ── Admin (laptop) ──
  {
    const device = 'laptop' as const;
    const { ctx, page } = await newSession(browser, device);
    const shot = (title: string, caption: string, o = {}) => capture(page, { journey: 'Admin', role: 'Admin', device, title, caption }, o);
    await signIn(page, 'admin');
    await page.goto('/admin');
    await shot('Admin overview', 'The admin home: today\'s figures and the menu grouped into seven sections.', { fullPage: true });
    const filter = page.getByPlaceholder(/find a page/i);
    if (await filter.count()) {
      await filter.fill('recall');
      await shot('Menu filter', 'Typing in "Find a page" narrows the menu.');
      await filter.fill('');
    }
    await page.goto('/admin/recall-alerts');
    await shot('Recall alerts', 'Regulator recall and not-of-standard-quality alerts with the 4-hour clock (C-28).');
    await page.goto('/admin/settings');
    await shot('Settings', 'Business settings such as the delivery-code scope and legal details, changed here rather than in code.', { fullPage: true });
    await page.goto('/staff/fulfilment');
    await page.getByRole('tab', { name: /h1 register/i }).or(page.getByRole('button', { name: /h1 register/i })).first().click().catch(() => {});
    await shot('Registers', 'Admins can open the same fulfilment queues and the Schedule H1 register (C-09).');
    await ctx.close();
  }

  writeManifest();
});
