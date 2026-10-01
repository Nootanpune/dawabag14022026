// ── Rider: run sheet and handover (phone) ──
import { Browser } from '@playwright/test';
import { capture } from '../lib/recorder';
import { token } from '../lib/people';
import { newSession, onScreenOr, signIn } from '../lib/steps';
import { shipmentsOf } from '../lib/orders';
import { call } from '../../support/data';
import type { Story } from '../lib/story';

export async function rider(browser: Browser, story: Story) {
  const { otc, rx } = story.orders;
  const code = story.deliveryCode ?? '';
  const device = 'phone' as const;
  const { ctx, page } = await newSession(browser, device);
  const shot = (title: string, caption: string, o: { note?: string; fullPage?: boolean } = {}) =>
    capture(page, { journey: 'Rider', role: 'Rider', device, title, caption, note: o.note }, o);
  await signIn(page, 'rider');
  await page.goto('/staff/run-sheet');
  await shot('Run sheet', 'The rider\'s stops: address, contact, seal number and whether a code is needed — never which medicines are inside (C-41).', { fullPage: true });
  for (const [i, num] of [rx!, otc!].entries()) {
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
    }, page);
    if (i === 1) await shot('Run complete', 'Both parcels delivered; the run sheet is empty.', { note });
  }
  await ctx.close();
}
