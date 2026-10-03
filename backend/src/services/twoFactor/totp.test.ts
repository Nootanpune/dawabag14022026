// Sprint 42 — TOTP checked against the RFC test vectors: RFC 4226 Appendix D (HOTP) and
// RFC 6238 Appendix B (TOTP with SHA-1, SHA-256 and SHA-512, 8 digits), plus RFC 4648 base32.
import { base32Decode, base32Encode, hotp, matchTotp, otpauthUri, stepAt, totp } from './totp';

const seed20 = Buffer.from('12345678901234567890', 'ascii');
const seed32 = Buffer.from('12345678901234567890123456789012', 'ascii');
const seed64 = Buffer.from('1234567890123456789012345678901234567890123456789012345678901234', 'ascii');

describe('HOTP (RFC 4226 Appendix D)', () => {
  const expected = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'];
  it.each(expected.map((code, counter) => [counter, code]))('counter %i → %s', (counter, code) => {
    expect(hotp(seed20, counter as number)).toBe(code);
  });
});

describe('TOTP (RFC 6238 Appendix B, 8 digits, 30 s)', () => {
  const vectors: [number, string, string, string][] = [
    [59, '94287082', '46119246', '90693936'],
    [1111111109, '07081804', '68084774', '25091201'],
    [1111111111, '14050471', '67062674', '99943326'],
    [1234567890, '89005924', '91819424', '93441116'],
    [2000000000, '69279037', '90698825', '38618901'],
    [20000000000, '65353130', '77737706', '47863826'],
  ];
  it.each(vectors)('T=%i', (t, sha1, sha256, sha512) => {
    expect(totp(seed20, t * 1000, { digits: 8, algorithm: 'sha1' })).toBe(sha1);
    expect(totp(seed32, t * 1000, { digits: 8, algorithm: 'sha256' })).toBe(sha256);
    expect(totp(seed64, t * 1000, { digits: 8, algorithm: 'sha512' })).toBe(sha512);
  });
  it('six digits by default: the last six of the SHA-1 vector', () => {
    expect(totp(seed20, 59_000)).toBe('287082');
    expect(totp(seed20, 1111111109_000)).toBe('081804');
  });
});

describe('matchTotp — current step ±1, constant-time, six digits only', () => {
  const now = 1_700_000_000_000;
  const at = (dSteps: number) => totp(seed20, now + dSteps * 30_000);
  it('accepts the current, previous and next step and says which', () => {
    expect(matchTotp(seed20, at(0), now)).toBe(stepAt(now));
    expect(matchTotp(seed20, at(-1), now)).toBe(stepAt(now) - 1);
    expect(matchTotp(seed20, at(1), now)).toBe(stepAt(now) + 1);
  });
  it('refuses two steps away, wrong codes and anything not six digits', () => {
    const two = at(-2);
    if (![at(-1), at(0), at(1)].includes(two)) expect(matchTotp(seed20, two, now)).toBeNull();
    expect(matchTotp(seed20, '12345', now)).toBeNull();
    expect(matchTotp(seed20, '1234567', now)).toBeNull();
    expect(matchTotp(seed20, 'abcdef', now)).toBeNull();
  });
});

describe('base32 (RFC 4648 §10) and the otpauth URI', () => {
  it.each([['', ''], ['f', 'MY'], ['fo', 'MZXQ'], ['foo', 'MZXW6'], ['foob', 'MZXW6YQ'], ['fooba', 'MZXW6YTB'], ['foobar', 'MZXW6YTBOI']])(
    '%j ↔ %s', (plain, enc) => {
      expect(base32Encode(Buffer.from(plain))).toBe(enc);
      expect(base32Decode(enc).toString()).toBe(plain);
    });
  it('decodes with spaces and lower case (as people type a key)', () => {
    expect(base32Decode('mzxw 6ytb oi').toString()).toBe('foobar');
    expect(() => base32Decode('MZ1W')).toThrow();
  });
  it('carries the secret, issuer and parameters, spaces as %20', () => {
    const uri = otpauthUri(seed20, '9000004201', 'DAWA BAG');
    expect(uri).toBe(`otpauth://totp/DAWA%20BAG:9000004201?secret=${base32Encode(seed20)}&issuer=DAWA%20BAG&algorithm=SHA1&digits=6&period=30`);
  });
});
