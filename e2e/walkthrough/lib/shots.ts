// Numbered screenshots for one device, plus a notes.json the reviewer reads with them.
// Output goes to WALKTHROUGH_OUT (a scratch folder outside the repository).
import { Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

export const OUT = process.env.WALKTHROUGH_OUT || join(process.cwd(), 'walkthrough-out');

export interface Note { n: number; device: string; file: string; title: string; note?: string }
const notes: Note[] = [];

export function shooter(page: Page, device: string) {
  let n = 0;
  mkdirSync(join(OUT, device), { recursive: true });
  return async (title: string, note?: string, o: { fullPage?: boolean } = {}) => {
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(400);
    n += 1;
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
    const file = `${device}/${String(n).padStart(2, '0')}-${slug}.png`;
    await page.screenshot({ path: join(OUT, file), fullPage: o.fullPage ?? false });
    notes.push({ n, device, file, title, note });
  };
}

export function writeNotes() {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'notes.json'), JSON.stringify(notes, null, 2));
}

/** Runs one step; a failure is noted (with a screenshot) and the walk goes on. */
export async function attempt(label: string, fn: () => Promise<void>, shot: (t: string, n?: string) => Promise<void>) {
  try { await fn(); } catch (e) {
    const msg = String(e).split('\n')[0].slice(0, 200);
    console.log(`  ✗ ${label}: ${msg}`);
    await shot(`${label} FAILED`, msg).catch(() => {});
  }
}
