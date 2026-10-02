// Sprint 35 — "Forgot password" with the OTP from /auth/send-otp (restyled sign-in
// pages; the app's forgot-password screens use the same endpoint). C-44: every older
// session ends; five wrong codes throw the code away.
import { call, check, redis } from '../sprint5/lib.mjs';
import { people } from './fixtures.mjs';

export async function runPasswordReset() {
  console.log('G. Forgot password: OTP then a new password');
  const p = people.resetter;
  const old = (await call('POST', '/auth/login', { body: { mobile: p.mobile, password: p.password } })).json.data?.access_token;
  let r = await call('POST', '/auth/send-otp', { body: { mobile: p.mobile } });
  check('a code is sent to the registered mobile', r.status === 200, r.json);
  const unknownSend = await call('POST', '/auth/send-otp', { body: { mobile: '9000003598' } });
  check('asking for a code for an unregistered mobile gets the very same answer', unknownSend.status === 200
    && unknownSend.json.message === r.json.message && (await redis.get('otp:9000003598')) === null, unknownSend.json);
  const otp = await redis.get(`otp:${p.mobile}`);
  const reset = (body) => call('POST', '/auth/reset-password', { body: { mobile: p.mobile, ...body } });
  r = await reset({ otp: otp === '111111' ? '222222' : '111111', new_password: 'NewPassw0rd1' });
  check('a wrong code is refused', r.status === 400 && /wrong or has expired/.test(r.json.message), r.json);
  r = await reset({ otp, new_password: 'short' });
  check('a weak password is refused before the code is used', r.status === 400 && /at least 8/.test(r.json.message), r.json);
  check('…and the code is still valid', (await redis.get(`otp:${p.mobile}`)) === otp);
  r = await reset({ otp, new_password: `Pass${p.mobile}1` });
  check('a password containing the mobile number is refused', r.status === 400, r.json);
  // Tokens are compared by the second they were issued; make sure the reset is in a later second
  await new Promise((res) => setTimeout(res, 1100));
  r = await reset({ otp, new_password: 'NewPassw0rd1' });
  check('the right code sets the new password and signs in', r.status === 200 && !!r.json.data?.access_token, r.json);
  r = await call('GET', '/users/me', { token: old });
  check('the session from before the reset no longer works', r.status === 401, r.status);
  r = await call('POST', '/auth/login', { body: { mobile: p.mobile, password: 'NewPassw0rd1' } });
  check('sign in with the new password', r.status === 200, r.json);
  r = await reset({ otp, new_password: 'OtherPassw0rd2' });
  check('the code works only once', r.status === 400, r.json);

  await call('POST', '/auth/send-otp', { body: { mobile: p.mobile } });
  for (let i = 0; i < 5; i++) await reset({ otp: '000000', new_password: 'OtherPassw0rd2' });
  check('five wrong codes throw the code away', (await redis.get(`otp:${p.mobile}`)) === null);
  r = await call('POST', '/auth/reset-password', { body: { mobile: '9000003598', otp: '123456', new_password: 'NewPassw0rd1' } });
  check('an unknown mobile gets the same answer as a wrong code', r.status === 400 && /wrong or has expired/.test(r.json.message), r.json);
}
