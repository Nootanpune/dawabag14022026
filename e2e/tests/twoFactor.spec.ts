// Sprint 42 — two-step sign-in with an authenticator app (security review Sprints 35–40 #16;
// C-41, C-43): a staff login sets it up on its own page (QR code drawn by the server, the
// first code switches it on, recovery codes shown once), then signs in with the password and
// the code; a recovery code works for a lost phone; when the super-admin makes it required, a
// login without it sets it up during sign-in. Codes are computed here with RFC 6238, as an
// authenticator app would. Data (made up): logins 9000001942 / 9000001943, removed by the
// global clean-up (users 90000019%).
import crypto from 'crypto';
import { expect, test, type Page } from '@playwright/test';
import { call, db, redis } from '../support/data';
import { expectNoBrowserStorage } from '../support/helpers';

const consent = { accept_privacy_notice: true, age_confirmed: true };
const staff = { customer_type: 'customer', full_name: 'E2E Two-step Admin', mobile: '9000001942', password: 'Passw0rd!', ...consent };
const packer = { customer_type: 'customer', full_name: 'E2E Two-step Packer', mobile: '9000001943', password: 'Passw0rd!', ...consent };

/** RFC 6238 (SHA-1, 30 s, 6 digits) from a base32 key, `steps` steps from now. */
function totp(base32: string, steps = 0): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const ch of base32.replace(/\s/g, '').toUpperCase()) bits += alphabet.indexOf(ch).toString(2).padStart(5, '0');
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map((b) => parseInt(b, 2)));
  const counter = Math.floor(Date.now() / 30_000) + steps;
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', key).update(msg).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

async function setPolicy(value: 'optional' | 'required') {
  const c = db();
  await c.connect();
  try { await c.query(`UPDATE app_settings SET value = $1 WHERE key = 'security.two_factor'`, [JSON.stringify(value)]); } finally { await c.end(); }
}

test.beforeAll(async () => {
  const r = redis(); const c = db();
  await c.connect();
  try {
    for (const p of [staff, packer]) {
      await call('POST', '/auth/register', p);
      const otp = await r.get(`otp:${p.mobile}`);
      if (otp) await call('POST', '/auth/verify-otp', { mobile: p.mobile, otp });
    }
    await c.query(`UPDATE users SET role = 'admin' WHERE mobile = $1`, [staff.mobile]);
    await c.query(`UPDATE users SET role = 'pharmacist_pack' WHERE mobile = $1`, [packer.mobile]);
  } finally { r.disconnect(); await c.end(); }
});
test.afterAll(() => setPolicy('optional'));

async function passwordStep(page: Page, who: { mobile: string; password: string }) {
  await page.goto('/auth/login');
  await page.getByPlaceholder('9876543210').fill(who.mobile);
  await page.getByPlaceholder('••••••••').fill(who.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

/** Shows the codes, ticks "kept", and returns them. */
async function keepRecoveryCodes(page: Page, button: string): Promise<string[]> {
  const list = page.getByRole('list', { name: 'Recovery codes' });
  await expect(list.getByRole('listitem')).toHaveCount(10);
  const codes = (await list.getByRole('listitem').allTextContents()).map((s) => s.trim());
  await expect(page.getByRole('button', { name: button })).toBeDisabled();
  await page.getByLabel('I have kept these codes somewhere safe').check();
  await page.getByRole('button', { name: button }).click();
  return codes;
}

test('a staff login switches two-step sign-in on, then signs in with the password and the code', async ({ page, browser }) => {
  await passwordStep(page, staff);
  await expect(page).not.toHaveURL(/\/auth\/login/);
  await page.goto('/staff/two-factor');
  await expect(page.getByTestId('two-factor-state')).toHaveText('Two-step sign-in is off');
  await page.getByRole('button', { name: 'Set up an authenticator app' }).click();
  await expect(page.getByTestId('two-factor-qr')).toBeVisible();
  expect(await page.getByTestId('two-factor-qr').getAttribute('src')).toMatch(/^data:image\/svg\+xml;base64,/);
  const secret = (await page.getByTestId('two-factor-secret').textContent())!.replace(/\s/g, '');
  expect(secret).toMatch(/^[A-Z2-7]{32}$/);
  await page.getByLabel('Code from the app').fill(totp(secret));
  await page.getByRole('button', { name: 'Switch on two-step sign-in' }).click();
  const codes = await keepRecoveryCodes(page, 'Done');
  await expect(page.getByTestId('two-factor-state')).toHaveText('Two-step sign-in is on');
  await expectNoBrowserStorage(page);

  // A new browser: the password alone no longer signs in
  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await passwordStep(p2, staff);
  await expect(p2.getByRole('heading', { name: 'Two-step sign-in' })).toBeVisible();
  await expect(p2).toHaveURL(/\/auth\/login/);
  await p2.getByLabel('Authenticator code').fill('000000' === totp(secret, 1) ? '111111' : '000000');
  await p2.getByRole('button', { name: 'Verify and sign in' }).click();
  await expect(p2.getByText(/That code is not right/)).toBeVisible();
  await p2.getByLabel('Authenticator code').fill(totp(secret, 1));   // the next step's code: each code works once
  await p2.getByRole('button', { name: 'Verify and sign in' }).click();
  await expect(p2).toHaveURL(/\/admin/);
  await expectNoBrowserStorage(p2);
  await ctx.close();

  // Lost phone: a recovery code instead
  const ctx3 = await browser.newContext();
  const p3 = await ctx3.newPage();
  await passwordStep(p3, staff);
  await p3.getByRole('button', { name: 'Lost your phone? Use a recovery code' }).click();
  await p3.getByLabel('Recovery code').fill(codes[0]);
  await p3.getByRole('button', { name: 'Verify and sign in' }).click();
  await expect(p3).toHaveURL(/\/admin/);
  await ctx3.close();
});

test('when the super-admin requires it, a login without it sets it up during sign-in', async ({ page }) => {
  await setPolicy('required');
  await passwordStep(page, packer);
  await expect(page.getByRole('heading', { name: 'Set up two-step sign-in' })).toBeVisible();
  await expect(page.getByText('Two-step sign-in is required for your login.')).toBeVisible();
  await expect(page.getByTestId('two-factor-qr')).toBeVisible();
  const secret = (await page.getByTestId('two-factor-secret').textContent())!.replace(/\s/g, '');
  await page.getByLabel('Code from the app').fill(totp(secret));
  await page.getByRole('button', { name: 'Switch on two-step sign-in' }).click();
  await keepRecoveryCodes(page, 'Continue to Dawabag');
  await expect(page).toHaveURL(/\/staff\/fulfilment/);
  await page.goto('/staff/two-factor');
  await expect(page.getByTestId('two-factor-state')).toHaveText('Two-step sign-in is on');
  await expect(page.getByText('It is required for your login and cannot be switched off.')).toBeVisible();
  await expectNoBrowserStorage(page);
});
