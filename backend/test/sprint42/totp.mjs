// The test's OWN RFC 6238 implementation (independent of src/services/twoFactor/totp.ts):
// the smoke test computes authenticator codes with it, as a phone app would. It is checked
// against the RFC 6238 Appendix B vectors before use (selfCheck).
import crypto from 'crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function fromBase32(s) {
  let bits = '';
  for (const ch of s.replace(/[\s=]/g, '').toUpperCase()) bits += ALPHABET.indexOf(ch).toString(2).padStart(5, '0');
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

export function code(key, unixSeconds, { digits = 6, algo = 'sha1', period = 30 } = {}) {
  const counter = Math.floor(unixSeconds / period);
  const msg = Buffer.alloc(8);
  msg.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  msg.writeUInt32BE(counter % 2 ** 32, 4);
  const h = crypto.createHmac(algo, key).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const n = (h.readUInt32BE(o) & 0x7fffffff) % 10 ** digits;
  return String(n).padStart(digits, '0');
}

/** The code an authenticator shows `offsetSteps` steps from now. */
export const codeNow = (secretB32, offsetSteps = 0) => code(fromBase32(secretB32), Date.now() / 1000 + offsetSteps * 30);

/** RFC 6238 Appendix B — all eighteen vectors must match. */
export function selfCheck() {
  const k1 = Buffer.from('12345678901234567890'), k2 = Buffer.from('12345678901234567890123456789012');
  const k5 = Buffer.from('1234567890123456789012345678901234567890123456789012345678901234');
  const V = [[59, '94287082', '46119246', '90693936'], [1111111109, '07081804', '68084774', '25091201'], [1111111111, '14050471', '67062674', '99943326'],
    [1234567890, '89005924', '91819424', '93441116'], [2000000000, '69279037', '90698825', '38618901'], [20000000000, '65353130', '77737706', '47863826']];
  return V.every(([t, a, b, c]) => code(k1, t, { digits: 8 }) === a && code(k2, t, { digits: 8, algo: 'sha256' }) === b
    && code(k5, t, { digits: 8, algo: 'sha512' }) === c);
}
