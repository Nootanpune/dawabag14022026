// ── Admin (laptop) ──
import { Browser } from '@playwright/test';
import { capture } from '../lib/recorder';
import { newSession, signIn } from '../lib/steps';

export async function admin(browser: Browser) {
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
