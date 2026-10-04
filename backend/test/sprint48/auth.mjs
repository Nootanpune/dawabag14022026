// Sprint 48 B — security review of Sprints 41–47: attempt limits that hold under parallel
// requests (#4), a super-admin's two-step reset ends the person's sessions (#9), doctor
// registrations decided by admins only (#6), health details sealed at start-up (#8).
import { API, call, check, q, redis } from '../sprint5/lib.mjs';
import { callAt, startApi } from '../sprint26/trialApi.mjs';
import { codeNow } from '../sprint42/totp.mjs';
import { P, ids, people, t } from '../sprint39/fixtures.mjs';

async function http(method, path, { body, token } = {}) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = `Bearer ${token}`;
  const res = await fetch(API + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}
const count = (rs, pred) => rs.filter(pred).length;

export async function runAuth() {
  console.log('\nB1. Sign-in codes: parallel guesses are each counted (#4)');
  const mobile = people.other.mobile;
  await redis.del(`otp_wrong:${mobile}`);
  await redis.set(`otp:${mobile}`, '424242', 'EX', 600);
  const wrong = Array.from({ length: 20 }, (_, i) => String(500000 + i));
  let rs = await Promise.all(wrong.map((otp) => http('POST', '/auth/verify-otp', { body: { mobile, otp } })));
  check('20 wrong codes at once: none accepted, and exactly every fifth throws the code away (4 × "Too many wrong codes")',
    count(rs, (r) => r.status === 200) === 0 && count(rs, (r) => /Too many wrong codes/.test(r.json.message ?? '')) === 4,
    rs.map((r) => r.json.message));
  let r = await http('POST', '/auth/verify-otp', { body: { mobile, otp: '424242' } });
  check('… and the right code no longer works (thrown away after the fifth wrong one)', r.status === 400, r.json);

  console.log('\nB2. Authenticator codes: parallel guesses are each counted (#4)');
  const start = await http('POST', '/auth/2fa/enrol/start', { token: t.packer, body: {} });
  const secret = String(start.json.data?.secret ?? '').replace(/\s/g, '');
  const done = await http('POST', '/auth/2fa/enrol/confirm', { token: t.packer, body: { code: codeNow(secret) } });
  const packerSession = done.json.data?.access_token;
  check('a packer switches on two-step sign-in (fixture)', done.status === 200 && !!packerSession, done.json);
  r = await http('POST', '/auth/login', { body: { mobile: people.packer.mobile, password: people.packer.password } });
  const ch = r.json.data?.challenge_token;
  const bad = (n) => String((Number(codeNow(secret, 3)) + n) % 1000000).padStart(6, '0');
  rs = await Promise.all(Array.from({ length: 10 }, (_, i) => http('POST', '/auth/2fa/verify', { body: { challenge_token: ch, code: bad(i) } })));
  check('10 wrong codes at once: only five are checked (4 × wrong, then paused) — the other five are refused unchecked',
    count(rs, (x) => x.status === 400 && x.json.code === 'TWO_FACTOR_CODE_WRONG') === 4 && count(rs, (x) => x.status === 429) === 6,
    rs.map((x) => `${x.status} ${x.json.code}`));
  const fails = await q(`SELECT new_value FROM audit_logs WHERE user_id = $1 AND action = 'two_factor_failed' AND created_at > NOW() - INTERVAL '2 minutes'`, [ids.packer]);
  check('audit: five counted tries (attempt 1–5) and five refused while paused', count(fails, (f) => f.new_value?.attempt) === 5
    && count(fails, (f) => f.new_value?.reason === 'paused') === 5, fails.map((f) => f.new_value));

  console.log('\nB3. A super-admin resets two-step sign-in: the person\'s open sessions end (#9)');
  r = await http('GET', '/auth/2fa/status', { token: packerSession });
  check('before the reset the packer\'s two-step session works', r.status === 200, r.json);
  await new Promise((res) => setTimeout(res, 1100));   // tokens carry whole seconds
  r = await http('POST', `/admin/two-factor/${ids.packer}/reset`, { token: t.admin, body: { reason: 'S48 test: lost phone, identity checked by call' } });
  check('reset by the super-admin', r.status === 200, r.json);
  r = await http('GET', '/auth/2fa/status', { token: packerSession });
  check('… the session opened before the reset no longer works (401)', r.status === 401 && /ended/.test(r.json.message ?? ''), r.json);
  check('audit says the sessions were ended', (await q(`SELECT 1 FROM audit_logs WHERE user_id = $1 AND action = 'two_factor_reset_by_admin'
    AND new_value->>'sessions_ended' = 'true'`, [ids.packer])).length === 1);
  await redis.del(`2fa_wrong:${ids.packer}`);
  r = await http('POST', '/auth/login', { body: { mobile: people.packer.mobile, password: people.packer.password } });
  check('… signing in again works (no second step any more, it is optional)', r.status === 200 && !!r.json.data?.access_token, r.json);
  t.packer = r.json.data?.access_token ?? t.packer;

  console.log('\nB4. Signing a written order: parallel password guesses are each counted (#4)');
  await redis.del(`wo_sign_wrong:${ids.doctor}`);
  await q(`UPDATE users SET nmc_status = 'verified', nmc_valid_till = CURRENT_DATE + 365, nmc_status_note = NULL WHERE id = $1`, [ids.doctor]);
  const sign = (password) => http('POST', '/written-orders/requisition', { token: t.doctor,
    body: { items: [{ product_id: P.otc, quantity: 1 }], typed_name: 'Dr Asha Rao', password, declaration: true } });
  rs = await Promise.all(Array.from({ length: 10 }, (_, i) => sign(`wrong-password-${i}`)));
  check('10 wrong passwords at once: five checked, five refused unchecked (429)', count(rs, (x) => x.status === 400) === 5
    && count(rs, (x) => x.status === 429 && x.json.code === 'WRITTEN_ORDER_SIGN_PAUSED') === 5, rs.map((x) => x.status));
  r = await sign(people.doctor.password);
  check('… the right password is refused too while paused', r.status === 429, r.json);
  await redis.del(`wo_sign_wrong:${ids.doctor}`);

  console.log('\nB5. Doctor registrations are decided by admins only (#6)');
  r = await call('POST', '/kyc/admin/verify-nmc', { token: t.pharmacist, body: { user_id: ids.doctor, nmc_number: 'MMC-S44-01', council_state: 'Maharashtra Medical Council', verified: true } });
  check('a pharmacist cannot decide through the older KYC route either → 403', r.status === 403, r.json);

  console.log('\nB6. Health details still in plain columns are sealed at start-up; an unreadable row does not stop it (#8)');
  for (const u of [ids.other, ids.pharmacistNew]) {
    await q(`INSERT INTO consent_records (user_id, purpose, granted, policy_version, notice_language) VALUES ($1, 'health_profile', TRUE, 'health-profile-v1', 'en')`, [u]);
  }
  await q(`DELETE FROM health_profiles WHERE user_id = ANY($1)`, [[ids.other, ids.pharmacistNew]]);
  await q(`INSERT INTO health_profiles (user_id, allergies, current_medicines, consent_version, consented_at) VALUES ($1, '["S48 Sulpha"]', '["S48 Metformin"]', 'health-profile-v1', NOW())`, [ids.other]);
  await q(`INSERT INTO health_profiles (user_id, sealed, consent_version, consented_at) VALUES ($1, 'h1.deadbeef.AAAA', 'health-profile-v1', NOW())`, [ids.pharmacistNew]);
  const api = await startApi(Number(process.env.PORT || 4000) + 48, {});
  try {
    const row = (await q(`SELECT sealed, allergies::text AS a FROM health_profiles WHERE user_id = $1`, [ids.other]))[0];
    check('the plain row was sealed when the API started; the plain columns emptied', !!api.base && /^h1\./.test(row?.sealed ?? '') && row.a === '[]', { row, log: api.base ? undefined : api.log });
    const bad = (await q(`SELECT sealed FROM health_profiles WHERE user_id = $1`, [ids.pharmacistNew]))[0];
    check('the row sealed with an unknown key is left as it was (reported in the log)', bad?.sealed === 'h1.deadbeef.AAAA', bad);
    if (api.base) {
      r = await callAt(api.base, 'GET', '/health-profile', { token: t.other });
      check('… and the sealed row reads back the same', r.status === 200 && r.json.data?.allergies?.[0] === 'S48 Sulpha', r.json);
    }
  } finally { await api.stop?.(); }
  await q(`DELETE FROM health_profiles WHERE user_id = ANY($1)`, [[ids.other, ids.pharmacistNew]]);
}
