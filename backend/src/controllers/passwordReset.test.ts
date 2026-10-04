// Sprint 35 — "Forgot password" by OTP (C-44): wrong codes counted and the code thrown
// away after five, the same answer for an unknown mobile, the policy applied before the
// code is spent, and a successful reset that ends every older session.
const redisStore = new Map<string, string>();
const fakeRedis = {
  get: jest.fn(async (k: string) => redisStore.get(k) ?? null),
  set: jest.fn(async (k: string, v: string) => { redisStore.set(k, v); return 'OK'; }),
  incr: jest.fn(async (k: string) => { const n = Number(redisStore.get(k) ?? 0) + 1; redisStore.set(k, String(n)); return n; }),
  expire: jest.fn(async () => 1),
  ttl: jest.fn(async () => 60),
  del: jest.fn(async (k: string) => (redisStore.delete(k) ? 1 : 0)),
  // Sprint 48: the OTP check is one Redis script; emulated with the same steps
  eval: jest.fn(async (_script: string, _n: number, code: string, wrong: string, guess: string, _ttl: string, max: string) => {
    if (redisStore.has(code) && redisStore.get(code) === guess) { redisStore.delete(code); redisStore.delete(wrong); return 'ok'; }
    const n = Number(redisStore.get(wrong) ?? 0) + 1; redisStore.set(wrong, String(n));
    if (n >= Number(max)) { redisStore.delete(code); redisStore.delete(wrong); return 'too_many'; }
    return 'wrong';
  }),
};
// The OTP service (Sprint 41) keeps codes and counters in Redis
jest.mock('../config/redis', () => ({ getRedis: () => fakeRedis }));
const sql: { text: string; params: unknown[] }[] = [];
jest.mock('../config/database', () => ({
  queryOne: jest.fn(async (text: string, params: unknown[]) => {
    sql.push({ text, params });
    if (/FROM users/.test(text)) return params[0] === '9876500001' ? { id: 'u1', role: 'customer', customer_type: 'customer', kyc_status: 'approved' } : null;
    return { full_name: 'Test Buyer' };
  }),
  withTransaction: jest.fn(async (fn: (c: any) => Promise<unknown>) => fn({ query: async (text: string, params: unknown[]) => { sql.push({ text, params }); return { rows: [] }; } })),
}));
jest.mock('../utils/jwt', () => ({ generateTokens: jest.fn(async () => ({ accessToken: 'a', refreshToken: 'r' })) }));
jest.mock('../utils/sessionCookie', () => ({ issueSession: () => ({ access_token: 'a' }) }));

import { resetPassword } from './passwordReset.controller';

function run(body: unknown) {
  return new Promise<{ status: number; body: any }>((resolve) => {
    const res: any = { json: (b: any) => resolve({ status: 200, body: b }) };
    resetPassword({ body, ip: '127.0.0.1' } as any, res, (err: any) => resolve({ status: err?.statusCode ?? 500, body: { message: err?.message } }));
  });
}

beforeEach(() => { redisStore.clear(); sql.length = 0; });

describe('POST /auth/reset-password', () => {
  it('refuses a weak password before using the code', async () => {
    redisStore.set('otp:9876500001', '123456');
    const r = await run({ mobile: '9876500001', otp: '123456', new_password: 'short' });
    expect(r.status).toBe(400);
    expect(redisStore.get('otp:9876500001')).toBe('123456');
  });

  it('gives the same answer for a wrong code and for an unknown mobile', async () => {
    redisStore.set('otp:9876500001', '123456');
    const wrong = await run({ mobile: '9876500001', otp: '000000', new_password: 'NewPassw0rd1' });
    const unknown = await run({ mobile: '9876500002', otp: '123456', new_password: 'NewPassw0rd1' });
    expect(wrong).toEqual(unknown);
    expect(wrong.status).toBe(400);
  });

  it('throws the code away after five wrong tries', async () => {
    redisStore.set('otp:9876500001', '123456');
    let last;
    for (let i = 0; i < 5; i++) last = await run({ mobile: '9876500001', otp: '000000', new_password: 'NewPassw0rd1' });
    expect(last!.body.message).toMatch(/Too many wrong codes/);
    expect(redisStore.has('otp:9876500001')).toBe(false);
    expect((await run({ mobile: '9876500001', otp: '123456', new_password: 'NewPassw0rd1' })).status).toBe(400);
  });

  it('sets the new password, ends older sessions, clears the lock and the temporary-password flag, audits without secrets', async () => {
    redisStore.set('otp:9876500001', '123456');
    const r = await run({ mobile: '9876500001', otp: '123456', new_password: 'NewPassw0rd1' });
    expect(r.status).toBe(200);
    const update = sql.find((s) => /UPDATE users SET password_hash/.test(s.text))!;
    expect(update.text).toMatch(/password_changed_at = \$3/);
    expect(update.text).toMatch(/must_change_password = FALSE/);
    expect(update.text).toMatch(/failed_login_attempts = 0, locked_until = NULL/);
    expect(update.params[1]).not.toBe('NewPassw0rd1');            // stored hashed
    const audit = sql.find((s) => /INSERT INTO audit_logs/.test(s.text))!;
    expect(audit.params[1]).toBe('password_reset_by_otp');
    expect(JSON.stringify(audit.params)).not.toMatch(/NewPassw0rd1|123456/);
    expect((await run({ mobile: '9876500001', otp: '123456', new_password: 'OtherPassw0rd2' })).status).toBe(400);   // single use
  });
});
