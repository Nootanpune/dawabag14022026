// src/utils/brand.ts — the DAWA BAG logo for documents (owner decision 2026-10-02).
// Read-only PNG renders of the owner's vector logo (backend/assets/brand/README.md);
// pdfkit cannot draw SVG. Emails link to the website's copy instead (no attachments).
import fs from 'fs';
import path from 'path';

const DIR = path.resolve(__dirname, '../../assets/brand');
const cache = new Map<string, Buffer | null>();

/** The logo PNG, or null when the file is missing (documents then print the name in text). */
export function brandLogo(kind: 'logo' | 'wordmark' = 'logo'): Buffer | null {
  if (!cache.has(kind)) {
    try { cache.set(kind, fs.readFileSync(path.join(DIR, `dawabag-${kind}.png`))); } catch { cache.set(kind, null); }
  }
  return cache.get(kind)!;
}

/** Brand colours (sampled from the logo by the owner) for PDFs and emails. */
export const BRAND = { teal: '#0397A6', tealText: '#037B87', green: '#87A959', greenText: '#557A2E', grey: '#565655' } as const;

/** Website base for links and the email logo (PUBLIC_WEB_URL, else the first CORS origin). */
export function publicWebUrl(): string {
  return (process.env.PUBLIC_WEB_URL || (process.env.CORS_ORIGINS || 'https://dawabag.in').split(',')[0]).replace(/\/$/, '');
}
