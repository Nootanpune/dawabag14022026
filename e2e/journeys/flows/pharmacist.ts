// ── Pharmacist: check the prescription (laptop) ──
import { Browser } from '@playwright/test';
import { capture } from '../lib/recorder';
import { token } from '../lib/people';
import { newSession, onScreenOr, signIn } from '../lib/steps';
import { dbRow } from '../lib/orders';
import { todayIST } from '../lib/time';
import { call } from '../../support/data';
import type { Story } from '../lib/story';

export async function pharmacist(browser: Browser, story: Story) {
  const rxId = process.env.E2E_RX_PRODUCT_ID!;
  const device = 'laptop' as const;
  const { ctx, page } = await newSession(browser, device);
  const shot = (title: string, caption: string, o = {}) => capture(page, { journey: 'Pharmacist', role: 'Pharmacist', device, title, caption }, o);
  await signIn(page, 'pharmacist');
  await page.goto('/staff/fulfilment');
  await shot('Prescription queue', 'The pharmacist lands on the Rx verify queue: orders waiting for a prescription check, oldest first.');
  await page.getByRole('button', { name: 'Review', exact: true }).first().click();
  await page.waitForTimeout(1200);
  await shot('Prescription and form', 'The uploaded prescription beside the form: doctor, registration number, date, patient and prescribed quantity (C-08, C-09).', { fullPage: true });
  const note = await onScreenOr(async () => {
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
    const rx = (await dbRow(`SELECT p.id FROM prescriptions p JOIN orders o ON o.id = p.order_id WHERE o.order_number = $1`, [story.orders.rx]))!.id;
    const r = await call('POST', `/fulfilment/prescriptions/${rx}/verify`, { prescriber_name: 'Dr. Asha Kulkarni', prescriber_reg_no: 'MMC-2011-4455',
      prescribed_on: todayIST(), patient_name: 'E2E Buyer', valid_days: 90, items: [{ product_id: rxId, prescribed_qty: 10 }] }, await token('pharmacist'));
    if (r.status >= 300) throw new Error(JSON.stringify(r.json));
  }, page);
  await page.reload();
  await capture(page, { journey: 'Pharmacist', role: 'Pharmacist', device, title: 'Verified', caption: 'Verified. The order leaves the queue and moves to packing; the check is recorded against the pharmacist\'s registration.', note });
  await ctx.close();
}
