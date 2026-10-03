// Sprint 42 B — two-step sign-in with an authenticator app for staff and partner logins
// (security review Sprints 35–40 #16; C-41, C-43, C-46). Codes are computed with the test's
// own RFC 6238 implementation (totp.mjs), checked against the RFC vectors first.
import { API, call, check, q, redis } from '../sprint5/lib.mjs';
import { ids, people, t } from '../sprint39/fixtures.mjs';
import { codeNow, selfCheck } from './totp.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** fetch with the web client's header when asked, returning the Set-Cookie header too */
async function http(method, path, { body, token, web = false } = {}) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = `Bearer ${token}`;
  if (web) h['X-Client'] = 'web';
  const res = await fetch(API + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, json: await res.json().catch(() => ({})), cookie: res.headers.get('set-cookie') };
}
const login = (p, password = p.password, web = false) => http('POST', '/auth/login', { body: { mobile: p.mobile, password }, web });
const audits = async (userId, action) => (await q(`SELECT action, performed_by, notes, new_value FROM audit_logs WHERE user_id = $1 AND action = $2 ORDER BY created_at`,
  [userId, action]));
/** Waits until the next 30-second step, so a fresh authenticator code exists (each code works once). */
async function nextStep() {
  const ms = 30_000 - (Date.now() % 30_000) + 300;
  await sleep(ms);
}
/** Enrols a signed-in login; returns its secret and recovery codes. */
async function enrol(token) {
  const start = await http('POST', '/auth/2fa/enrol/start', { token, body: {} });
  const secret = start.json.data?.secret?.replace(/\s/g, '');
  const done = await http('POST', '/auth/2fa/enrol/confirm', { token, body: { code: codeNow(secret) } });
  return { start, done, secret, codes: done.json.data?.recovery_codes ?? [] };
}

export async function runTwoFactor() {
  console.log('\nB. Two-step sign-in (authenticator app) for staff and partner logins');
  check("the test's own RFC 6238 implementation matches the RFC's 18 test vectors (SHA-1/256/512)", selfCheck());

  let r = await http('GET', '/auth/2fa/status', { token: t.opsAdmin });
  check('an admin: applies, optional by default, not on yet', r.status === 200 && r.json.data?.applies === true && r.json.data.policy === 'optional'
    && r.json.data.enrolled === false && r.json.data.required === false, r.json);
  r = await http('POST', '/auth/2fa/enrol/start', { token: t.buyer, body: {} });
  check('buyers cannot switch it on (staff and partner logins only)', r.status === 403, r.json);

  // ── Enrolment (signed in, optional) ───────────────────────────────────────
  const admin = await enrol(t.opsAdmin);
  check('enrolment starts: QR code drawn on the server (SVG data URL), the text key and the otpauth URI', admin.start.status === 200
    && /^data:image\/svg\+xml;base64,/.test(admin.start.json.data?.qr_svg_data_url ?? '')
    && Buffer.from(admin.start.json.data.qr_svg_data_url.split(',')[1], 'base64').toString().includes('<svg')
    && admin.start.json.data.otpauth_uri.startsWith(`otpauth://totp/DAWA%20BAG:${people.opsAdmin.mobile}?secret=${admin.secret}&issuer=DAWA%20BAG`)
    && admin.secret.length === 32, admin.start.json.data && { ...admin.start.json.data, qr_svg_data_url: '…' });
  check('confirmed with the first code: ten recovery codes shown once, and a two-step session', admin.done.status === 200
    && admin.codes.length === 10 && new Set(admin.codes).size === 10 && !!admin.done.json.data?.access_token, admin.done.json);
  const row = (await q(`SELECT secret_enc, status, confirmed_at, last_used_step FROM user_two_factor WHERE user_id = $1`, [ids.opsAdmin]))[0];
  const hashes = await q(`SELECT code_hash FROM user_recovery_codes WHERE user_id = $1`, [ids.opsAdmin]);
  check('stored: the secret encrypted (not the key), recovery codes only as keyed hashes', row?.status === 'active' && row.secret_enc.startsWith('v1.')
    && !row.secret_enc.includes(admin.secret) && hashes.length === 10 && hashes.every((h) => /^[0-9a-f]{64}$/.test(h.code_hash)
      && !admin.codes.some((c) => h.code_hash.includes(c.replace('-', '')))), { status: row?.status, codes: hashes.length });
  check('audit: two_factor_enrolled', (await audits(ids.opsAdmin, 'two_factor_enrolled')).length === 1);
  r = await http('POST', '/auth/2fa/enrol/start', { token: t.opsAdmin, body: {} });
  check('starting again while on is refused (no silent replacement)', r.status === 409 && r.json.code === 'TWO_FACTOR_ALREADY_ON', r.json);

  // ── Sign-in: password, then the code; nothing issued before the second step ──
  r = await login(people.opsAdmin, people.opsAdmin.password, true);
  const ch1 = r.json.data?.challenge_token;
  check('password sign-in → the code step: no access token, no refresh token, no cookie', r.status === 200 && r.json.data?.two_factor === 'code'
    && !!ch1 && !r.json.data.access_token && !r.json.data.refresh_token && !r.cookie, { body: r.json, cookie: r.cookie });
  r = await http('GET', '/auth/2fa/status', { token: ch1 });
  check('the challenge is not a session', r.status === 401);
  const wrong = codeNow(admin.secret, 5);
  r = await http('POST', '/auth/2fa/verify', { body: { challenge_token: ch1, code: wrong } });
  check('a wrong code is refused (and audited)', r.status === 400 && r.json.code === 'TWO_FACTOR_CODE_WRONG'
    && (await audits(ids.opsAdmin, 'two_factor_failed')).length === 1, r.json);
  // The enrolment used the current step; the next step's code is fresh (±1 step accepted)
  const fresh = codeNow(admin.secret, 1);
  r = await http('POST', '/auth/2fa/verify', { body: { challenge_token: ch1, code: fresh }, web: true });
  const adminSession = r.json.data?.access_token;
  check('the right code → a session; the web gets its httpOnly cookie only now', r.status === 200 && !!adminSession
    && r.json.data.second_step === 'authenticator' && /dwb_rt=/.test(r.cookie ?? '') && /HttpOnly/i.test(r.cookie ?? ''), { body: r.json, cookie: r.cookie });
  r = await http('GET', '/auth/2fa/status', { token: adminSession });
  check('… a two-step session', r.json.data?.session_two_step === true && r.json.data.enrolled === true && r.json.data.recovery_codes_left === 10, r.json);
  r = await http('POST', '/auth/2fa/verify', { body: { challenge_token: ch1, code: fresh } });
  check('a challenge works once', r.status === 401 && r.json.code === 'TWO_FACTOR_CHALLENGE_EXPIRED', r.json);
  r = await login(people.opsAdmin);
  r = await http('POST', '/auth/2fa/verify', { body: { challenge_token: r.json.data?.challenge_token, code: fresh } });
  check('replay: the same code is refused on a new sign-in (each code once)', r.status === 400 && r.json.code === 'TWO_FACTOR_CODE_WRONG', r.json);
  r = await login(people.opsAdmin);
  r = await http('POST', '/auth/2fa/verify', { body: { challenge_token: r.json.data?.challenge_token, code: codeNow(admin.secret, -1) } });
  check('… and so is an older step\'s code', r.status === 400, r.json);

  // ── Recovery codes ────────────────────────────────────────────────────────
  r = await login(people.opsAdmin);
  r = await http('POST', '/auth/2fa/verify', { body: { challenge_token: r.json.data?.challenge_token, code: admin.codes[0].toUpperCase() } });
  check('a recovery code signs in (lost phone), case-insensitive; nine left', r.status === 200 && r.json.data?.second_step === 'recovery_code'
    && r.json.data.recovery_codes_left === 9 && !!r.json.data.access_token, r.json);
  check('… audited', (await audits(ids.opsAdmin, 'two_factor_recovery_code_used')).length === 1);
  r = await login(people.opsAdmin);
  r = await http('POST', '/auth/2fa/verify', { body: { challenge_token: r.json.data?.challenge_token, code: admin.codes[0] } });
  check('the same recovery code works once', r.status === 400, r.json);

  // ── Attempt limit ─────────────────────────────────────────────────────────
  await redis.del(`2fa_wrong:${ids.opsAdmin}`);
  r = await login(people.opsAdmin);
  const ch2 = r.json.data?.challenge_token;
  const answers = [];
  for (let i = 0; i < 5; i++) answers.push(await http('POST', '/auth/2fa/verify', { body: { challenge_token: ch2, code: '000000' === codeNow(admin.secret) ? '111111' : '000000' } }));
  check('five wrong codes → paused (429) with a plain wait', answers.slice(0, 4).every((a) => a.status === 400) && answers[4].status === 429
    && answers[4].json.code === 'TWO_FACTOR_PAUSED' && /wait \d+ minutes/.test(answers[4].json.message), answers.map((a) => a.json.code));
  r = await login(people.opsAdmin);
  r = await http('POST', '/auth/2fa/verify', { body: { challenge_token: r.json.data?.challenge_token, code: admin.codes[1] } });
  check('while paused even a right code is refused', r.status === 429, r.json);
  check('… audited (two_factor_paused)', (await audits(ids.opsAdmin, 'two_factor_paused')).length >= 1);
  await redis.del(`2fa_wrong:${ids.opsAdmin}`);

  // ── "Forgot password" and sign-in by SMS code do not skip the second step ──
  await redis.del(`otp_gap:${people.opsAdmin.mobile}`, `otp_sends:${people.opsAdmin.mobile}`, `otp_wrong:${people.opsAdmin.mobile}`);
  await sleep(1100);   // tokens carry whole seconds: one from the same second as the change still counts
  await call('POST', '/auth/send-otp', { body: { mobile: people.opsAdmin.mobile } });
  let otp = await redis.get(`otp:${people.opsAdmin.mobile}`);
  r = await http('POST', '/auth/reset-password', { body: { mobile: people.opsAdmin.mobile, otp, new_password: 'S42NewPassw0rd' }, web: true });
  check('SMS password reset of a login with two-step sign-in: the password changes, but no session — the code step', r.status === 200
    && r.json.data?.two_factor === 'code' && !r.json.data.access_token && !r.cookie && /Password changed/.test(r.json.message), { body: r.json, cookie: r.cookie });
  r = await http('GET', '/auth/2fa/status', { token: adminSession });
  check('… every older session ended (password changed)', r.status === 401);
  r = await login(people.opsAdmin, 'S42NewPassw0rd');
  check('the next sign-in with the new password still asks for the code', r.status === 200 && r.json.data?.two_factor === 'code' && !r.json.data.access_token, r.json);
  r = await http('POST', '/auth/2fa/verify', { body: { challenge_token: r.json.data?.challenge_token, code: admin.codes[2] } });
  check('… a recovery code completes it', r.status === 200 && !!r.json.data?.access_token, r.json);
  t.opsAdmin = r.json.data?.access_token;
  people.opsAdmin.password = 'S42NewPassw0rd';
  await call('POST', '/auth/send-otp', { body: { mobile: people.opsAdmin.mobile } });
  otp = await redis.get(`otp:${people.opsAdmin.mobile}`);
  r = await http('POST', '/auth/verify-otp', { body: { mobile: people.opsAdmin.mobile, otp } });
  check('sign-in by SMS code is only the first step too', r.status === 200 && r.json.data?.two_factor === 'code' && !r.json.data.access_token, r.json);

  // ── A session without the second step ends at its next renewal ───────────
  r = await login(people.pharmacist);
  const oldRefresh = r.json.data?.refresh_token;
  check('a pharmacist without it (optional) signs in with the password only', r.status === 200 && !!r.json.data?.access_token && !r.json.data.two_factor, r.json);
  const ph = await enrol(r.json.data.access_token);
  check('… switches it on while signed in: a new two-step session comes with it', ph.done.status === 200 && !!ph.done.json.data?.refresh_token, ph.done.json);
  r = await http('POST', '/auth/refresh', { body: { refresh_token: oldRefresh } });
  check('the old password-only session is not renewed (TWO_FACTOR_SIGN_IN_REQUIRED)', r.status === 401 && r.json.code === 'TWO_FACTOR_SIGN_IN_REQUIRED', r.json);
  r = await http('POST', '/auth/refresh', { body: { refresh_token: ph.done.json.data.refresh_token } });
  check('the two-step session is renewed', r.status === 200 && !!r.json.data?.access_token, r.json);

  // ── Super-admin reset (lost phone), audited ───────────────────────────────
  r = await http('GET', '/admin/two-factor', { token: t.opsAdmin });
  const listed = r.json.data?.people?.find((p) => p.user_id === ids.pharmacist);
  check('admins see who has two-step sign-in (no mobile numbers)', r.status === 200 && listed?.enrolled === true && !('mobile' in (listed ?? {})), listed);
  r = await http('POST', `/admin/two-factor/${ids.pharmacist}/reset`, { token: t.opsAdmin, body: { reason: 'Lost phone, identity checked by call' } });
  check('an admin cannot reset it (super-admin only)', r.status === 403, r.json);
  r = await http('POST', `/admin/two-factor/${ids.admin}/reset`, { token: t.admin, body: { reason: 'Trying to reset my own login' } });
  check('a super-admin cannot reset their own this way', r.status === 400, r.json);
  r = await http('POST', `/admin/two-factor/${ids.pharmacist}/reset`, { token: t.admin, body: { reason: 'Lost phone, identity checked by call' } });
  const resetAudit = await audits(ids.pharmacist, 'two_factor_reset_by_admin');
  check('a super-admin resets another login\'s two-step sign-in, with the reason in the audit log', r.status === 200 && resetAudit.length === 1
    && resetAudit[0].performed_by === ids.admin && /Lost phone/.test(resetAudit[0].notes ?? ''), { r: r.json, resetAudit });
  r = await login(people.pharmacist);
  check('… (optional) the pharmacist then signs in with the password alone until they set it up again', r.status === 200 && !!r.json.data?.access_token, r.json);
  t.pharmacist = r.json.data?.access_token;

  // ── REQUIRED: enrolment forced at the next sign-in ────────────────────────
  r = await http('PUT', '/admin/settings/security.two_factor', { token: t.opsAdmin, body: { value: 'required' } });
  check('only a super-admin changes the setting', r.status === 403, r.json);
  r = await http('PUT', '/admin/settings/security.two_factor', { token: t.admin, body: { value: 'required' } });
  check('the super-admin sets it to required (audited as a setting change)', r.status === 200, r.json);
  r = await login(people.partner);
  const enrolCh = r.json.data?.challenge_token;
  check('a partner login without it: the sign-in asks to set it up first — no session', r.status === 200 && r.json.data?.two_factor === 'enrol'
    && !r.json.data.access_token, r.json);
  r = await http('GET', '/partner/me', { token: enrolCh });
  check('… the enrolment challenge opens nothing else', r.status === 401);
  r = await http('POST', '/auth/2fa/enrol/start', { body: { challenge_token: enrolCh } });
  const pSecret = r.json.data?.secret?.replace(/\s/g, '');
  check('… it sets up the app with the challenge (QR code and key)', r.status === 200 && pSecret?.length === 32, r.json);
  r = await http('POST', '/auth/2fa/enrol/confirm', { body: { challenge_token: enrolCh, code: codeNow(pSecret) }, web: true });
  check('… confirms with a code: recovery codes, then the session and cookie', r.status === 200 && r.json.data?.recovery_codes?.length === 10
    && !!r.json.data.access_token && /dwb_rt=/.test(r.cookie ?? ''), r.json);
  const partnerSession = r.json.data?.access_token;
  r = await http('POST', '/auth/2fa/disable', { token: partnerSession, body: { password: people.partner.password, code: codeNow(pSecret, 1) } });
  check('while required it cannot be switched off', r.status === 409 && r.json.code === 'TWO_FACTOR_REQUIRED', r.json);
  r = await login(people.packer);
  const packerCh = r.json.data?.challenge_token;
  check('a packer is asked to set it up too', r.json.data?.two_factor === 'enrol', r.json);
  r = await login(people.buyer);
  check('buyers are never asked', r.status === 200 && !!r.json.data?.access_token && !r.json.data.two_factor, r.json);
  r = await http('POST', '/auth/refresh', { body: { refresh_token: (await login(people.buyer)).json.data?.refresh_token } });
  check('… and their sessions renew as before', r.status === 200, r.json);
  // The reset pharmacist's password-only session from before: not renewed now that it is required
  const phLogin = await login(people.pharmacist);
  check('the reset pharmacist is asked to set it up again at the next sign-in', phLogin.json.data?.two_factor === 'enrol', phLogin.json);
  r = await http('POST', '/auth/2fa/enrol/confirm', { body: { challenge_token: packerCh, code: '123456' } });
  check('confirming without starting is refused', r.status === 409 && r.json.code === 'TWO_FACTOR_NOT_STARTED', r.json);
  r = await http('PUT', '/admin/settings/security.two_factor', { token: t.admin, body: { value: 'optional' } });
  check('back to optional', r.status === 200, r.json);

  // ── Switching it off and new recovery codes (optional) ────────────────────
  // The last code used was the step after the one at enrolment: wait for a new step and take
  // the next one, which is always newer than any used (each code works once)
  await nextStep();
  const later = codeNow(admin.secret, 1);
  r = await http('POST', '/auth/2fa/recovery-codes', { token: t.opsAdmin, body: { password: 'wrong-password', code: later } });
  check('new recovery codes need the password', r.status === 400 && r.json.code === 'PASSWORD_WRONG', r.json);
  r = await http('POST', '/auth/2fa/recovery-codes', { token: t.opsAdmin, body: { password: people.opsAdmin.password, code: later } });
  const renewed = r.json.data?.recovery_codes ?? [];
  check('… and a current code: ten new ones; the old ones stop working', r.status === 200 && renewed.length === 10
    && !renewed.includes(admin.codes[3]), r.json);
  r = await login(people.opsAdmin);
  r = await http('POST', '/auth/2fa/verify', { body: { challenge_token: r.json.data?.challenge_token, code: admin.codes[3] } });
  check('an old recovery code is refused', r.status === 400, r.json);
  await redis.del(`2fa_wrong:${ids.opsAdmin}`);
  r = await http('POST', '/auth/2fa/disable', { token: t.opsAdmin, body: { password: people.opsAdmin.password, code: renewed[0] } });
  check('switched off (optional) with the password and a code; audited', r.status === 200
    && (await audits(ids.opsAdmin, 'two_factor_disabled')).length === 1, r.json);
  r = await login(people.opsAdmin);
  check('… sign-in is password only again', r.status === 200 && !!r.json.data?.access_token, r.json);
  t.opsAdmin = r.json.data?.access_token;
  const failed = await audits(ids.opsAdmin, 'two_factor_failed');
  check('every failed attempt is in the audit log (no codes in it)', failed.length >= 8
    && failed.every((a) => !JSON.stringify(a.new_value).match(/\d{6}|[a-z0-9]{5}-[a-z0-9]{5}/)), failed.length);
}
