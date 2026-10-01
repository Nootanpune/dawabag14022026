// Captures one screenshot per journey step with a caption for the reviewer.
// Screenshots and the step list go to JOURNEYS_OUT (a scratch folder outside the
// repository); nothing is stored by the website or the app.
import { Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

export interface Step {
  journey: string; role: string; device: 'phone' | 'laptop';
  n: number; title: string; caption: string; file: string; note?: string;
}

const OUT = process.env.JOURNEYS_OUT || join(process.cwd(), 'journeys-out');
const steps: Step[] = [];
const counters = new Map<string, number>();

export function outDir() { mkdirSync(join(OUT, 'shots'), { recursive: true }); return OUT; }

/** Waits for the page to settle, then records the step. */
export async function capture(page: Page, s: Omit<Step, 'n' | 'file'>, opts: { fullPage?: boolean } = {}) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(500);
  const key = `${s.journey}-${s.device}`;
  const n = (counters.get(key) ?? 0) + 1;
  counters.set(key, n);
  const file = `shots/${key}-${String(n).padStart(2, '0')}.png`;
  await page.screenshot({ path: join(outDir(), file), fullPage: opts.fullPage ?? false });
  steps.push({ ...s, n, file });
}

export function writeManifest() {
  writeFileSync(join(outDir(), 'steps.json'), JSON.stringify({ recorded_at: new Date().toISOString(), steps }, null, 2));
}
