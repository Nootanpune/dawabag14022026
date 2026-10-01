// ── Packer: pack and hand to a rider (laptop) ──
import { Browser } from '@playwright/test';
import { capture } from '../lib/recorder';
import { token } from '../lib/people';
import { newSession, onScreenOr, signIn } from '../lib/steps';
import { dbRow, shipmentsOf } from '../lib/orders';
import { call } from '../../support/data';
import type { Story } from '../lib/story';

export async function packer(browser: Browser, story: Story) {
  const { otc, rx } = story.orders;
  const device = 'laptop' as const;
  const { ctx, page } = await newSession(browser, device);
  const shot = (title: string, caption: string, o: { note?: string; fullPage?: boolean } = {}) =>
    capture(page, { journey: 'Packer', role: 'Packer', device, title, caption, note: o.note }, o);
  await signIn(page, 'packer');
  await page.goto('/staff/fulfilment');
  await shot('Pack queue', 'The packer sees paid orders ready to pack, with product, quantity, batch and expiry for each line (FEFO).', { fullPage: true });
  for (const num of [rx!, otc!]) {
    const [sid] = await shipmentsOf(num);
    const note = await onScreenOr(async () => {
      const card = page.locator('div', { hasText: num }).filter({ has: page.getByRole('button', { name: 'Mark packed' }) }).last();
      await card.getByRole('button', { name: 'Mark packed' }).click();
      await page.waitForTimeout(1200);
    }, async () => { const r = await call('POST', `/fulfilment/shipments/${sid}/pack`, undefined, await token('packer')); if (r.status >= 300) throw new Error(JSON.stringify(r.json)); });
    if (num === rx) await shot('Packed', `Order ${num} packed; stock is taken from the batch shown.`, { note });
  }
  await page.getByRole('tab', { name: /dispatch/i }).or(page.getByRole('button', { name: /^dispatch/i })).first().click();
  await page.waitForTimeout(1000);
  await shot('Dispatch queue', 'Packed parcels waiting to leave, each needing a tamper-evident seal number.');
  for (const [i, num] of [rx!, otc!].entries()) {
    const [sid] = await shipmentsOf(num);
    const note = await onScreenOr(async () => {
      const card = page.locator('div', { hasText: num }).filter({ has: page.getByRole('button', { name: 'Dispatch', exact: true }) }).last();
      await card.getByRole('button', { name: 'Dispatch', exact: true }).click();
      await page.getByLabel('Our rider').check();
      const riderSelect = page.locator('select').filter({ has: page.locator('option', { hasText: 'Journey Rider' }) });
      await riderSelect.selectOption({ label: await riderSelect.locator('option', { hasText: 'Journey Rider' }).innerText() });
      await page.locator('input.font-mono').fill(`SEAL-R2-${i + 1}`);
      if (i === 0) await shot('Dispatch to our rider', 'Choosing our own rider (or a courier with AWB) and recording the seal number (C-26).');
      await page.getByRole('button', { name: 'Mark dispatched' }).click();
      await page.getByRole('button', { name: 'Done', exact: true }).waitFor();
      if (i === 0) await shot('Run reference', 'Dispatched to our rider: the run reference stands in for a courier tracking number.');
      await page.getByRole('button', { name: 'Done', exact: true }).click();
      await page.waitForTimeout(1000);
    }, async () => {
      const rider = (await dbRow(`SELECT id FROM users WHERE mobile = '9000001905'`))!.id;
      const r = await call('POST', `/fulfilment/shipments/${sid}/dispatch`, { rider_id: rider, seal_number: `SEAL-R2-${i + 1}` }, await token('packer'));
      if (r.status >= 300) throw new Error(JSON.stringify(r.json));
    }, page);
    if (i === 1) await shot('Dispatched', 'Both parcels are out with the rider; buyers are notified.', { note });
  }
  await ctx.close();
}
