// GSTIN early feedback on the admin's partner form — a mirror of the server's
// utils/gstin.ts (the server decides). Standard mod-36 check character.
const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const SHAPE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function gstinCheckChar(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const product = CHARS.indexOf(first14[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return CHARS[(36 - (sum % 36)) % 36];
}

/** A plain reason the GSTIN looks wrong, or '' when it looks right. */
export function gstinProblem(raw: string): string {
  const g = raw.replace(/\s+/g, '').toUpperCase();
  if (!g) return 'Enter the GSTIN';
  if (g.length !== 15) return 'A GSTIN has exactly 15 characters';
  if (!SHAPE.test(g)) return 'This is not a GSTIN: it should look like 27ABCDE1234F1Z5';
  if (gstinCheckChar(g.slice(0, 14)) !== g[14]) return 'The last character does not match — check for a typing mistake';
  return '';
}
