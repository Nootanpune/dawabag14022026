// Sprint 40 add-on (owner's trial testing): with no SMS provider configured, /auth/send-otp
// says so plainly — the same answer for every number — instead of pretending a code was
// sent; admins see the missing configuration on the dashboard.
import { call, check } from '../sprint5/lib.mjs';
import { callAt, startApi } from '../sprint26/trialApi.mjs';
import { people, t } from './fixtures.mjs';

export async function runSmsNotConfigured() {
  console.log('\nK. Sign-in codes when SMS is not configured');
  let r = await call('POST', '/auth/send-otp', { body: { mobile: people.buyer.mobile } });
  check('with MSG91 configured a code is sent as before', r.status === 200 && r.json.data?.otp_sent === true, r.json);
  r = await call('GET', '/admin/config-warnings', { token: t.opsAdmin });
  check('… and the dashboard has no SMS warning', r.status === 200 && !r.json.data.warnings.some((w) => w.code === 'SMS_NOT_CONFIGURED'), r.json.data);
  const api = await startApi(4140, { MSG91_AUTH_KEY: undefined, MSG91_TEMPLATE_OTP: undefined });
  if (!api.base) { check('API without MSG91 started', false, String(api.log).slice(-500)); return; }
  try {
    const known = await callAt(api.base, 'POST', '/auth/send-otp', { body: { mobile: people.buyer.mobile } });
    const unknown = await callAt(api.base, 'POST', '/auth/send-otp', { body: { mobile: '9000004098' } });
    check('no MSG91 → 503 SMS_NOT_CONFIGURED with a plain message', known.status === 503 && known.json.code === 'SMS_NOT_CONFIGURED'
      && /Text-message codes are not switched on yet/.test(known.json.message), known.json);
    check('… the very same answer for a number with no account', unknown.status === known.status && unknown.json.code === known.json.code
      && unknown.json.message === known.json.message, unknown.json);
    r = await callAt(api.base, 'GET', '/admin/config-warnings', { token: t.opsAdmin });
    check('admins see SMS_NOT_CONFIGURED on the dashboard', r.status === 200 && r.json.data.warnings.some((w) => w.code === 'SMS_NOT_CONFIGURED'), r.json);
    r = await callAt(api.base, 'GET', '/admin/config-warnings', { token: t.buyer });
    check('… buyers do not', r.status === 403);
  } finally { await api.stop(); }
}
