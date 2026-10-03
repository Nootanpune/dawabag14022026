// Sprint 41 smoke test — launch readiness: the security review of Sprints 35–40
// (docs/security/review-sprint35-40.md) and the API's own restricted database login.
//   A. the API (and its jobs) as a login in dawabag_app only; the runner repairs it
//   B. one-time codes: send limit per mobile (no account probing), wrong codes counted
//      across sign-in by code and "Forgot password", switched-off accounts not reset
//   C. a held prescription payment's capture never crosses a cancellation; one capture only
//   D. approved cold-chain couriers at dispatch (URS-105)
//   E. JSON body limit, one chain check at a time, another partner's excursion, staff
//      lists without mobiles, the chain heads a backup records
//
//   . scripts/dev-env.sh && scripts/dev-up.sh && node test/sprint41.smoke.mjs
// It starts the fake providers in-process and a short-lived API on port 4141.
import { db, redis, state } from './sprint5/lib.mjs';
import { startFakes } from './fakes/server.mjs';
import { cleanup, setup } from './sprint41/fixtures.mjs';
import { runRestrictedLogin } from './sprint41/login.mjs';
import { runOtp } from './sprint41/otp.mjs';
import { runCaptureRace } from './sprint41/capture.mjs';
import { runColdChainCouriers, runHardening } from './sprint41/hardening.mjs';

// Built on the Sprint 39 fixtures, which set online-sale status and registrations themselves
state.sprint39Defaults = false;

let fakes;
async function main() {
  const missing = ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET', 'RAZORPAY_BASE_URL', 'MSG91_AUTH_KEY'].filter((k) => !process.env[k]);
  if (missing.length) throw new Error(`Run with the fake provider environment (. scripts/dev-env.sh); missing ${missing.join(', ')}`);
  fakes = await startFakes();
  await db.connect();
  // Clean-up and the database checks act as the maintenance role (test database only)
  await db.query("SET ROLE dawabag_maintenance; SET dawabag.maintenance = 'on'");
  await cleanup();
  try {
    await setup();
    await runRestrictedLogin();
    await runOtp();
    await runCaptureRace();
    await runColdChainCouriers();
    await runHardening();
  } finally { await cleanup(); }
  console.log(state.failures ? `\n${state.failures} check(s) FAILED` : '\nAll Sprint 41 checks passed');
}

main()
  .catch((e) => { state.failures++; console.error(e); })
  .finally(async () => { fakes?.close(); await db.end().catch(() => {}); redis.disconnect(); process.exit(state.failures ? 1 : 0); });
