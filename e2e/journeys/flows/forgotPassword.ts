// ── Customer: forgot password (phone; Sprint 35) ──
// The DAWA BAG sign-in page, "Forgot password?", a 6-digit code to the registered
// mobile, the new password twice, and signed in. A code is asked for in the same
// words whether or not the mobile has an account (C-41, C-44). Uses its own test
// account (Journey Forgetful) so the other journeys keep their passwords.
import { Browser } from '@playwright/test';
import { capture } from '../lib/recorder';
import { everyone } from '../lib/people';
import { newSession, onScreenOr } from '../lib/steps';
import { call, redis } from '../../support/data';

const J = 'Customer — forgot password';
const NEW_PASSWORD = 'Journey9Reset';

async function latestCode(mobile: string) {
  const r = redis();
  try {
    for (let i = 0; i < 20; i++) { const v = await r.get(`otp:${mobile}`); if (v) return v; await new Promise((x) => setTimeout(x, 250)); }
    throw new Error('no code was sent');
  } finally { r.disconnect(); }
}

export async function forgotPassword(browser: Browser) {
  const who = everyone.forgetful;
  const device = 'phone' as const;
  const { ctx, page } = await newSession(browser, device);
  const shot = (title: string, caption: string, o: { note?: string; fullPage?: boolean } = {}) =>
    capture(page, { journey: J, role: 'Customer', device, title, caption, note: o.note }, o);
  await page.goto('/auth/login');
  await page.getByRole('link', { name: 'DAWA BAG home' }).waitFor();
  await shot('Sign in (DAWA BAG)', 'The rebranded sign-in page: DAWA BAG logo with its tagline, labels above rounded fields, "One-time code" and "Forgot password?" (Sprint 35).');
  const note = await onScreenOr(async () => {
    await page.getByRole('link', { name: 'Forgot password?' }).click();
    await page.getByRole('heading', { name: 'Forgot password' }).waitFor();
    await page.getByLabel('Mobile number').fill(who.mobile);
    await page.getByRole('button', { name: 'Send code' }).click();
    await page.getByText(`If +91 ${who.mobile} has an account`).waitFor();
    await shot('Code sent', 'The same answer whether or not the mobile has an account, so nobody can find out who is registered (C-41).');
    await page.getByLabel('Code').fill(await latestCode(who.mobile));
    await page.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD);
    await page.getByLabel('New password again').fill(NEW_PASSWORD);
    await shot('New password', 'The 6-digit code and the new password twice; the same password rules as everywhere else.');
    await page.getByRole('button', { name: 'Change password' }).click();
    await page.waitForURL((u) => !u.pathname.startsWith('/auth/'), { timeout: 10_000 });
  }, async () => {
    await call('POST', '/auth/send-otp', { mobile: who.mobile });
    const r = await call('POST', '/auth/reset-password', { mobile: who.mobile, otp: await latestCode(who.mobile), new_password: NEW_PASSWORD });
    if (r.status >= 300) throw new Error(JSON.stringify(r.json));
  }, page);
  await shot('Signed in', 'Password changed: every other session of this account is signed out, and the person is signed in here (C-44).', { note });
  await ctx.close();
}
