// src/utils/signedLink.ts — short-lived signed links for documents (invoice and
// credit-note PDFs) so the mobile app can open them in the system viewer
// without putting the access token in a URL. HMAC over path + expiry.
import crypto from 'crypto';

const secret = () => process.env.DOCUMENT_LINK_SECRET || process.env.JWT_ACCESS_SECRET || '';
const mac = (path: string, exp: number) => crypto.createHmac('sha256', secret()).update(`${path}|${exp}`).digest('hex');

export function signPath(path: string, ttlSeconds = 300): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  return `${path}?exp=${exp}&sig=${mac(path, exp)}`;
}

export function verifySignedPath(path: string, exp: unknown, sig: unknown): boolean {
  const e = Number(exp);
  if (!secret() || !Number.isInteger(e) || e < Date.now() / 1000 || typeof sig !== 'string') return false;
  const expected = Buffer.from(mac(path, e));
  const given = Buffer.from(sig);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}
