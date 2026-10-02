// A demo customer's whole journey, as the owner would walk it on the trial:
// search (home and header, with typos), add, change quantity, back, cart, upload a
// prescription, add a Schedule H medicine, checkout to the payment result.
// Every step is screenshotted; a step that cannot be done is noted and the walk goes on.
//   WALKTHROUGH_OUT=/some/folder TRIAL_DEMO_PASSWORD=… npx playwright test -c walkthrough/walkthrough.config.ts
import { test, devices, type Page } from '@playwright/test';
import { attempt, shooter, writeNotes } from './lib/shots';
import { emptyCart, prescriptionJpeg, signIn } from './lib/customer';

const WEB = process.env.WEB_URL || 'http://localhost:3000';
const DEVICES = {
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: devices['Pixel 7'].userAgent },
  desktop: { viewport: { width: 1366, height: 860 } },
} as const;

/** The search box a customer sees first on this page: the page's own, else the header's. */
async function searchBox(page: Page) {
  for (const sel of ['#home-search', '#header-search']) {
    const box = page.locator(sel);
    if (await box.isVisible().catch(() => false)) return box;
  }
  return page.getByRole('combobox', { name: /search/i }).or(page.getByRole('searchbox')).first();
}

async function typeSlowly(page: Page, box: ReturnType<Page['locator']>, text: string) {
  await box.click();
  await box.fill('');
  await box.pressSequentially(text, { delay: 60 });
  await page.waitForTimeout(1200);   // debounce + the server's answer
}

for (const [device, use] of Object.entries(DEVICES)) {
  test(`customer walkthrough — ${device}`, async ({ browser }) => {
    await emptyCart();
    const ctx = await browser.newContext({ ...use, baseURL: WEB, locale: 'en-IN', timezoneId: 'Asia/Kolkata' });
    const page = await ctx.newPage();
    const shot = shooter(page, device);
    const step = (label: string, fn: () => Promise<void>) => attempt(label, fn, shot);

    await step('sign in', async () => { await signIn(page); });
    await step('home', async () => { await page.goto('/'); await shot('Home after sign in'); });

    // ── Search on the home page ──
    await step('home search paracetamol', async () => {
      const box = await searchBox(page);
      await typeSlowly(page, box, 'paracetamol');
      await shot('Home search typed paracetamol', 'What the customer sees right after typing (no scrolling)');
    });
    await step('add from home suggestions', async () => {
      await page.getByRole('button', { name: /^Add Paracetamol 500 mg Tablet/ }).first().click();
      await page.waitForTimeout(1200);
      await page.getByRole('button', { name: /^Increase quantity of Paracetamol 500 mg Tablet/ }).first().click();
      await page.waitForTimeout(1200);
      await shot('Home suggestions - added and raised to 2');
    });
    await step('home search enter', async () => {
      await page.locator('#home-search').click();
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1500);
      await shot('Home search after Enter', page.url());
    });

    // ── Header search on another page, with short words and typos ──
    for (const q of ['para', 'cetirizine', 'paracitamol']) {
      await step(`header search ${q}`, async () => {
        if (!page.url().includes('/search')) await page.goto('/search');
        const box = page.locator('#header-search');
        await typeSlowly(page, box, q);
        await shot(`Header search typed ${q}`);
      });
    }

    // ── Add from the suggestions, then change the quantity there ──
    await step('add from suggestions', async () => {
      const box = page.locator('#header-search');
      await typeSlowly(page, box, 'paracetamol 650');
      await page.getByRole('button', { name: /^Add Paracetamol 650 mg Tablet/ }).first().click();
      await page.waitForTimeout(1200);
      await shot('Added Paracetamol 650 from the header suggestions');
    });
    await step('increase in suggestions', async () => {
      await page.getByRole('button', { name: /^Increase quantity of Paracetamol 650 mg Tablet/ }).first().click();
      await page.waitForTimeout(1200);
      await shot('Quantity raised in the header suggestions');
    });
    await page.keyboard.press('Escape').catch(() => {});

    // ── Results page: add and change quantity on a card ──
    await step('results page', async () => {
      await page.goto('/search?q=cetirizine');
      await shot('Search results for cetirizine');
    });
    await step('add on card', async () => {
      await page.getByRole('button', { name: /^Add Cetirizine 10 mg Tablet to cart/ }).first().click();
      await page.waitForTimeout(1200);
      await shot('After Add on a result card');
    });
    await step('card stepper', async () => {
      await page.getByRole('button', { name: /^Increase quantity of Cetirizine/ }).first().click();
      await page.waitForTimeout(1200);
      await shot('Card quantity raised to 2');
    });

    // ── Product page: choose quantity before adding; back navigation ──
    await step('product page', async () => {
      await page.getByRole('link', { name: /Cetirizine 10 mg Tablet/ }).first().click();
      await page.waitForURL(/\/shop\//);
      await shot('Product page (in cart - stepper)', 'Is there a quantity choice and a way back?');
      await page.goto('/search?q=vitamin c');
      await page.getByRole('link', { name: /Vitamin C 500 mg/ }).first().click();
      await page.waitForURL(/\/shop\//);
      await page.getByRole('button', { name: 'One more' }).click();
      await page.getByRole('button', { name: 'One more' }).click();
      await shot('Product page - choose 3 before adding');
      await page.getByRole('button', { name: /^Add 3 to cart/ }).click();
      await page.waitForTimeout(1200);
      await shot('Product page - 3 added, stepper and Go to cart');
    });
    await step('back from product', async () => {
      await page.getByRole('button', { name: 'Back', exact: true }).first().click();
      await page.waitForTimeout(1200);
      await shot('After pressing Back on the product page', page.url());
    });

    // ── Cart ──
    await step('cart', async () => {
      await page.goto('/cart');
      await shot('Cart', undefined, { fullPage: true });
    });
    await step('cart stepper', async () => {
      await page.getByRole('button', { name: /^Increase quantity of Paracetamol 500 mg Tablet/ }).first().click();
      await page.waitForTimeout(1200);
      await shot('Cart after raising Paracetamol by one');
    });

    // ── Upload a prescription on /prescriptions ──
    await step('upload prescription', async () => {
      await page.goto('/prescriptions');
      const jpeg = await prescriptionJpeg(page);
      await page.locator('input[type=file]').first().setInputFiles({ name: 'demo-prescription.jpg', mimeType: 'image/jpeg', buffer: jpeg });
      await page.waitForTimeout(800);
      await page.waitForTimeout(2000);
      await shot('Prescription uploaded', undefined, { fullPage: true });
    });

    // ── A Schedule H medicine ──
    await step('add schedule H', async () => {
      await page.goto('/search?q=amoxicillin');
      await page.getByRole('button', { name: /^Add Amoxicillin 500 mg Capsule to cart/ }).first().click();
      await page.waitForTimeout(1200);
      await shot('Added a prescription medicine (Amoxicillin)');
    });

    // ── Checkout ──
    await step('checkout address', async () => {
      await page.goto('/cart');
      await shot('Cart with a prescription medicine', undefined, { fullPage: true });
      await page.getByRole('link', { name: /checkout/i }).or(page.getByRole('button', { name: /checkout/i })).first().click();
      await page.waitForURL(/\/checkout/);
      await shot('Checkout — address', undefined, { fullPage: true });
    });
    await step('checkout prescription', async () => {
      await page.getByRole('button', { name: /Continue to prescription/ }).click();
      await page.waitForTimeout(1500);
      await shot('Checkout - prescription step', undefined, { fullPage: true });
      await page.getByRole('radio', { name: /Prescription/ }).first().click();
      await page.waitForTimeout(500);
      await shot('Checkout - prescription chosen');
    });
    await step('checkout review', async () => {
      await page.getByRole('button', { name: /Continue to review/ }).click();
      await page.waitForTimeout(2500);
      await shot('Checkout - review with prescription', undefined, { fullPage: true });
    });
    await step('place order', async () => {
      await page.getByRole('button', { name: /Place order/ }).click();
      await page.waitForTimeout(2500);
      await shot('Payment screen', undefined, { fullPage: true });
    });
    await step('pay', async () => {
      const upi = page.getByRole('button', { name: /^UPI/ });
      if (await upi.isVisible().catch(() => false)) {
        // The trial's demo checkout (Sprint 27): each method opens its own step, like Razorpay's window
        const pay = () => page.getByRole('button', { name: /^Pay ₹/ }).click();
        const changeMethod = () => page.getByRole('button', { name: 'Change method' }).click();
        await upi.click();
        await shot('Demo payment - UPI step (UPI ID)', undefined, { fullPage: true });
        await page.getByRole('tab', { name: 'Scan QR' }).click();
        await shot('Demo payment - UPI step (demo QR)', undefined, { fullPage: true });
        await page.getByRole('tab', { name: 'Pay by UPI ID' }).click();
        await pay();
        await shot('Demo payment - approve in your UPI app', undefined, { fullPage: true });
        await page.getByRole('button', { name: 'Decline (demo)' }).click();
        await page.getByText("Payment didn't go through. No money was taken.").waitFor();
        await shot('Demo payment - UPI declined', undefined, { fullPage: true });
        await page.getByRole('button', { name: 'Try again' }).click();
        await page.getByRole('button', { name: /^Card/ }).click();
        await shot('Demo payment - card step (test card, read-only)', undefined, { fullPage: true });
        await pay();
        await shot('Demo payment - bank OTP', undefined, { fullPage: true });
        await page.getByRole('button', { name: 'Go back' }).click();
        await changeMethod();
        await page.getByRole('button', { name: /^Wallet/ }).click();
        await page.getByRole('radio', { name: 'PhonePe' }).click();
        await shot('Demo payment - wallet step', undefined, { fullPage: true });
        await pay();
        await shot('Demo payment - wallet approve', undefined, { fullPage: true });
        await page.getByRole('button', { name: 'Go back' }).click();
        await changeMethod();
        await page.getByRole('button', { name: /^Netbanking/ }).click();
        await page.getByRole('radio', { name: 'HDFC' }).click();
        await shot('Demo payment - netbanking step (HDFC chosen)', undefined, { fullPage: true });
        await pay();
        await shot('Demo payment - HDFC demo bank page', undefined, { fullPage: true });
        await page.getByRole('button', { name: 'Success' }).click();
      } else {
        await page.getByRole('button', { name: /Pay .* securely/ }).click();
      }
      await page.waitForTimeout(3000);
      await shot('After paying', page.url(), { fullPage: true });
    });

    await ctx.close();
  });
}

test.afterAll(() => writeNotes());
