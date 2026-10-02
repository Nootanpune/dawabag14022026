// Trust pages (Sprint 33) — pure helpers, unit-tested in tokens.test.ts.

export const INFO_PAGE_KEYS = ['genuine-medicines', 'expired-damaged-recalled', 'pharmacist-checked'] as const;
export type InfoPageKey = typeof INFO_PAGE_KEYS[number];

export const isInfoPageKey = (v: unknown): v is InfoPageKey =>
  typeof v === 'string' && (INFO_PAGE_KEYS as readonly string[]).includes(v);

/** Tokens a page may use; each is filled from the live settings when shown. */
export const INFO_PAGE_TOKENS = ['sell_min_shelf_days', 'receive_min_shelf_days', 'returns_report_hours',
  'returns_expiry_claim_days', 'returns_near_expiry_days'] as const;

/** Replaces {{token}} with its value; an unknown token is left as written (the admin sees it). */
export function fillTokens(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (all, k: string) => (k in values ? values[k] : all));
}

/** Tokens used in a text that we do not know — refused when publishing. */
export function unknownTokens(text: string): string[] {
  const found = [...text.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)].map((m) => m[1]);
  return [...new Set(found.filter((k) => !(INFO_PAGE_TOKENS as readonly string[]).includes(k)))];
}
