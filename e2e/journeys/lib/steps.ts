// Small helpers shared by the journeys
import { Page, BrowserContext, Browser, devices } from '@playwright/test';
import { everyone } from './people';

export const WEB = process.env.WEB_URL || 'http://localhost:3000';
export const sizes = {
  phone: { ...devices['Pixel 7'] },
  laptop: { viewport: { width: 1366, height: 860 } },
};

export async function newSession(browser: Browser, device: keyof typeof sizes): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ ...sizes[device], baseURL: WEB, locale: 'en-IN', timezoneId: 'Asia/Kolkata' });
  return { ctx, page: await ctx.newPage() };
}

export async function signIn(page: Page, who: keyof typeof everyone) {
  await page.goto('/auth/login');
  await page.getByPlaceholder('9876543210').fill(everyone[who].mobile);
  await page.getByPlaceholder('••••••••').fill(everyone[who].password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/auth/login'));
}

/** Tries the action on screen; if the screen can't do it, the API does it and the step says so. */
export async function onScreenOr(action: () => Promise<void>, viaApi: () => Promise<void>): Promise<string | undefined> {
  try { await action(); return undefined; } catch (e) {
    await viaApi();
    return `Done through the API for this recording (on-screen step failed: ${String(e).split('\n')[0].slice(0, 140)})`;
  }
}

/** A small prescription image made in memory for the upload step */
export function prescriptionPng(): Buffer {
  // 1×1 PNG; the pharmacist sees the image the buyer uploaded
  return Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
}
