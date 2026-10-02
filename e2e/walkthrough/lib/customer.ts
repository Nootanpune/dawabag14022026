// The demo customer of the trial seed (backend/src/scripts/demoSeed.ts) and a few API
// helpers so every walk starts from the same place (an empty server cart).
import { Page } from '@playwright/test';

export const API = (process.env.API_URL || 'http://localhost:4000') + '/api/v1';
export const MOBILE = process.env.WALK_MOBILE || '9000090001';
export const PASSWORD = process.env.TRIAL_DEMO_PASSWORD || '';

async function token(): Promise<string> {
  const r = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mobile: MOBILE, password: PASSWORD }) });
  const j: any = await r.json();
  if (!j?.data?.access_token) throw new Error(`Demo customer sign-in failed: ${JSON.stringify(j).slice(0, 200)}`);
  return j.data.access_token;
}

/** Empty the server cart (the cart lives only on the server). */
export async function emptyCart() {
  await fetch(`${API}/cart`, { method: 'DELETE', headers: { Authorization: `Bearer ${await token()}` } });
}

export async function signIn(page: Page) {
  await page.goto('/auth/login');
  await page.getByPlaceholder('9876543210').fill(MOBILE);
  await page.getByPlaceholder('••••••••').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/auth/login'));
}

/** A small JPEG "prescription", drawn in the browser (nothing read from or kept on disk). */
export async function prescriptionJpeg(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 480; c.height = 320;
    const g = c.getContext('2d')!;
    g.fillStyle = '#fff'; g.fillRect(0, 0, 480, 320);
    g.fillStyle = '#123'; g.font = 'bold 22px sans-serif'; g.fillText('Dr Demo Doctor — DEMO prescription', 20, 40);
    g.font = '18px sans-serif';
    ['Patient: Demo Customer', 'Rx Amoxicillin 500 mg Capsule — 1 strip', 'Signed: Dr Demo (Reg. DEMO-0001)'].forEach((t, i) => g.fillText(t, 20, 100 + i * 40));
    return c.toDataURL('image/jpeg', 0.8);
  });
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}
