// Sprint 41 security review #1, #2, #9: one-time codes — send limit per mobile, wrong codes
// counted for every caller, codes used once, OS random source.
const store = new Map<string, string>();
const ttls = new Map<string, number>();
const fakeRedis = {
  get: jest.fn(async (k: string) => store.get(k) ?? null),
  set: jest.fn(async (k: string, v: string, _ex?: string, secs?: number, nx?: string) => {
    if (nx === 'NX' && store.has(k)) return null;
    store.set(k, v); if (secs) ttls.set(k, secs); return 'OK';
  }),
  incr: jest.fn(async (k: string) => { const n = Number(store.get(k) ?? 0) + 1; store.set(k, String(n)); return n; }),
  expire: jest.fn(async (k: string, s: number) => { ttls.set(k, s); return 1; }),
  ttl: jest.fn(async (k: string) => ttls.get(k) ?? -1),
  del: jest.fn(async (...ks: string[]) => ks.reduce((n, k) => n + (store.delete(k) ? 1 : 0), 0)),
  // Sprint 48: the Redis scripts, emulated with the same steps (one call = one atomic step)
  eval: jest.fn(async (script: string, n: number, ...args: string[]) => {
    const keys = args.slice(0, n), argv = args.slice(n);
    const incr = (k: string, ttl: number) => { const v = Number(store.get(k) ?? 0) + 1; store.set(k, String(v)); if (v === 1) ttls.set(k, ttl); return v; };
    if (script.includes("'too_many'")) {
      if (store.has(keys[0]) && store.get(keys[0]) === argv[0]) { store.delete(keys[0]); store.delete(keys[1]); return 'ok'; }
      const v = incr(keys[1], Number(argv[1]));
      if (v >= Number(argv[2])) { store.delete(keys[0]); store.delete(keys[1]); return 'too_many'; }
      return 'wrong';
    }
    return incr(keys[0], Number(argv[0]));
  }),
};
jest.mock('../../config/redis', () => ({ getRedis: () => fakeRedis }));

import { checkOtp, generateOtp, OTP_MAX_WRONG, storeNewOtp, takeOtpSendSlot } from './otp.service';

beforeEach(() => { store.clear(); ttls.clear(); delete process.env.OTP_SEND_MIN_GAP_SECONDS; delete process.env.OTP_SENDS_PER_HOUR; });

describe('one-time codes', () => {
  it('are six digits from crypto.randomInt', () => {
    const spy = jest.spyOn(require('crypto'), 'randomInt');
    const codes = Array.from({ length: 50 }, generateOtp);
    expect(codes.every((c) => /^\d{6}$/.test(c))).toBe(true);
    expect(spy).toHaveBeenCalledWith(100000, 1000000);
    spy.mockRestore();
  });

  it('limit sends per mobile: one per gap, then the hourly count (defaults 30 s and 5)', async () => {
    expect(await takeOtpSendSlot('9876500001')).toEqual({ ok: true });
    const second = await takeOtpSendSlot('9876500001');
    expect(second).toEqual({ ok: false, retryAfterS: 30 });
    expect(await takeOtpSendSlot('9876500002')).toEqual({ ok: true });   // another mobile is independent
    process.env.OTP_SEND_MIN_GAP_SECONDS = '0';
    for (let i = 0; i < 4; i++) expect((await takeOtpSendSlot('9876500003')).ok).toBe(true);
    expect((await takeOtpSendSlot('9876500003')).ok).toBe(true);        // fifth
    expect((await takeOtpSendSlot('9876500003')).ok).toBe(false);       // sixth in the hour
  });

  it('a code works once', async () => {
    const otp = await storeNewOtp('9876500001');
    expect(await checkOtp('9876500001', otp)).toBe('ok');
    expect(await checkOtp('9876500001', otp)).toBe('wrong');
  });

  it(`throws the code away after ${OTP_MAX_WRONG} wrong tries, whoever asks`, async () => {
    const otp = await storeNewOtp('9876500001');
    const bad = otp === '000000' ? '111111' : '000000';
    for (let i = 1; i < OTP_MAX_WRONG; i++) expect(await checkOtp('9876500001', bad)).toBe('wrong');
    expect(await checkOtp('9876500001', bad)).toBe('too_many');
    expect(await checkOtp('9876500001', otp)).toBe('wrong');            // gone
  });

  it('a right code clears the wrong-code count', async () => {
    let otp = await storeNewOtp('9876500001');
    const bad = otp === '000000' ? '111111' : '000000';
    await checkOtp('9876500001', bad);
    expect(await checkOtp('9876500001', otp)).toBe('ok');
    expect(store.has('otp_wrong:9876500001')).toBe(false);
    otp = await storeNewOtp('9876500001');
    expect(await checkOtp('9876500001', otp.slice(0, 5))).toBe('wrong');   // a different length is simply wrong
  });

  it('Sprint 48: parallel guesses are each counted — at most five tries reach the code', async () => {
    const otp = await storeNewOtp('9876500009');
    const wrong = Array.from({ length: 50 }, (_, i) => String(100000 + i)).filter((g) => g !== otp);
    wrong.splice(20, 0, otp);                                          // the right code as the 21st guess
    const results = await Promise.all(wrong.map((g) => checkOtp('9876500009', g)));
    expect(results.slice(0, 5)).toEqual(['wrong', 'wrong', 'wrong', 'wrong', 'too_many']);
    expect(results).not.toContain('ok');                               // the code was gone after the fifth
  });

  it('Sprint 48: something that is not a code is a wrong try too', async () => {
    await storeNewOtp('9876500010');
    expect(await checkOtp('9876500010', 'abc')).toBe('wrong');
    expect(store.get('otp_wrong:9876500010')).toBe('1');
  });
});
