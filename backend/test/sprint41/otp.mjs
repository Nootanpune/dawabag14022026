// Sprint 41 security review #1, #2, #9, #10 — one-time codes (C-41, C-44): a limit on codes sent
// per mobile that says nothing about who has an account, wrong codes counted per mobile across
// sign-in by code AND "Forgot password", and a switched-off account not reset by code.
import bcrypt from 'bcryptjs';
import { call, check, q, redis } from '../sprint5/lib.mjs';
import { callAt, startApi } from '../sprint26/trialApi.mjs';
import { ids, people } from '../sprint39/fixtures.mjs';
import { UNKNOWN_MOBILE } from './fixtures.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shape = (r) => ({ status: r.status, code: r.json.code ?? null, message: String(r.json.message ?? '').replace(/\d+ (seconds|minutes)/, 'N') });

export async function runOtp() {
  console.log('\nB. One-time codes: send limit per mobile, wrong codes counted everywhere');
  const known = people.buyer.mobile;
  // Its own API with the production defaults' shape: one code every 2 s, three an hour
  const api = await startApi(4141, { OTP_SEND_MIN_GAP_SECONDS: '2', OTP_SENDS_PER_HOUR: '3' });
  if (!api.base) { check('API with send limits started', false, api.log?.slice?.(-500)); return; }
  try {
    for (const m of [known, UNKNOWN_MOBILE]) await redis.del(`otp_gap:${m}`, `otp_sends:${m}`);
    const send = (mobile) => callAt(api.base, 'POST', '/auth/send-otp', { body: { mobile } });
    const k1 = await send(known), u1 = await send(UNKNOWN_MOBILE);
    const k2 = await send(known), u2 = await send(UNKNOWN_MOBILE);
    check('first code: 200 for a registered and an unknown mobile alike', k1.status === 200 && u1.status === 200
      && k1.json.message === u1.json.message, { k1: k1.json, u1: u1.json });
    check('a second code within the gap → 429 OTP_SEND_LIMIT with a plain wait', k2.status === 429 && k2.json.code === 'OTP_SEND_LIMIT'
      && /wait \d+ seconds/.test(k2.json.message), k2.json);
    check('… the same answer for an unknown mobile (the limit reveals no account)', JSON.stringify(shape(k2)) === JSON.stringify(shape(u2)), { k2: shape(k2), u2: shape(u2) });
    await sleep(2100); const k3 = await send(known);
    await sleep(2100); const k4 = await send(known);
    await sleep(2100); const k5 = await send(known);
    check('after the gap codes go out again, up to the hourly limit (3), then 429', k3.status === 200 && k4.status === 200
      && k5.status === 429 && k5.json.code === 'OTP_SEND_LIMIT', [k3.status, k4.status, k5.json]);
    const otp = await redis.get(`otp:${known}`);
    check('codes are six digits', /^\d{6}$/.test(otp ?? ''), otp);
  } finally { await api.stop(); }

  // Wrong codes: three on sign-in by code, two on "Forgot password" — the fifth throws the code away
  await redis.del(`otp_wrong:${known}`);
  let r = await call('POST', '/auth/send-otp', { body: { mobile: known } });
  const code = await redis.get(`otp:${known}`);
  const wrong = code === '000000' ? '111111' : '000000';
  const verifyWrong = () => call('POST', '/auth/verify-otp', { body: { mobile: known, otp: wrong } });
  const resetWrong = () => call('POST', '/auth/reset-password', { body: { mobile: known, otp: wrong, new_password: 'NewPassw0rd41' } });
  const answers = [await verifyWrong(), await verifyWrong(), await verifyWrong(), await resetWrong(), await resetWrong()];
  check('wrong codes are counted per mobile across /auth/verify-otp and /auth/reset-password', answers.slice(0, 4).every((a) => a.status === 400)
    && /Too many wrong codes/.test(answers[4].json.message ?? ''), answers.map((a) => a.json.message));
  r = await call('POST', '/auth/verify-otp', { body: { mobile: known, otp: code } });
  check('… after the fifth the right code no longer works (a new one must be asked for)', r.status === 400 && !(await redis.get(`otp:${known}`)), r.json);

  // A switched-off account is not reset by code: the same answer as a wrong code, nothing changes
  const other = people.other.mobile;
  const [before] = await q('SELECT password_hash FROM users WHERE id = $1', [ids.other]);
  await q('UPDATE users SET is_active = FALSE WHERE id = $1', [ids.other]);
  try {
    await call('POST', '/auth/send-otp', { body: { mobile: other } });
    const c2 = await redis.get(`otp:${other}`);
    r = await call('POST', '/auth/reset-password', { body: { mobile: other, otp: c2, new_password: 'NewPassw0rd41' } });
    const [after] = await q('SELECT password_hash FROM users WHERE id = $1', [ids.other]);
    check('a switched-off account: reset by code answers like a wrong code and changes nothing', r.status === 400
      && r.json.message === 'The code is wrong or has expired' && after.password_hash === before.password_hash
      && !(await bcrypt.compare('NewPassw0rd41', after.password_hash)), r.json);
  } finally { await q('UPDATE users SET is_active = TRUE WHERE id = $1', [ids.other]); }
}
