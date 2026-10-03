// Sprint 42 smoke test — frozen sale identity per shipment (handover D15) and two-step
// sign-in with an authenticator app for staff and partner logins (security review
// Sprints 35–40 #16).
//   A. each shipment's sale record fixed at order placement: seller licences and the licence
//      each line was sold under, channel, buyer type / licences; a licence renewed later does
//      not change it (invoice, sales register); the database refuses changes; the pharmacist
//      of record is filled once at the check; older shipments backfilled and marked so
//   B. RFC 6238 codes (checked with the test's own implementation and the RFC vectors),
//      enrolment with a QR code, nothing issued before the second step, replay refused,
//      recovery codes once, attempt limit, SMS reset / sign-in by code do not bypass it,
//      sessions without it end at renewal, super-admin reset with audit, REQUIRED forces
//      enrolment, switching off and new recovery codes
//
//   . scripts/dev-env.sh && scripts/dev-up.sh && node test/sprint42.smoke.mjs
// Runs against the API at API_URL (connected as the restricted login, Sprint 41).
import { db, redis, state } from './sprint5/lib.mjs';
import { startFakes } from './fakes/server.mjs';
import { cleanup, setup } from './sprint42/fixtures.mjs';
import { runSaleIdentity } from './sprint42/saleIdentity.mjs';
import { runTwoFactor } from './sprint42/twoFactor.mjs';

// Built on the Sprint 39 fixtures, which set online-sale status and registrations themselves
state.sprint39Defaults = false;

let fakes;
async function main() {
  const missing = ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET', 'RAZORPAY_BASE_URL', 'MSG91_AUTH_KEY'].filter((k) => !process.env[k]);
  if (missing.length) throw new Error(`Run with the fake provider environment (. scripts/dev-env.sh); missing ${missing.join(', ')}`);
  fakes = await startFakes();
  await db.connect();
  // Clean-up and the fixtures' direct writes act as the maintenance role (test database only)
  await db.query("SET ROLE dawabag_maintenance; SET dawabag.maintenance = 'on'");
  await cleanup();
  try {
    await setup();
    await runSaleIdentity();
    await runTwoFactor();
  } finally { await cleanup(); }
  console.log(state.failures ? `\n${state.failures} check(s) FAILED` : '\nAll Sprint 42 checks passed');
}

main()
  .catch((e) => { state.failures++; console.error(e); })
  .finally(async () => { fakes?.close(); await db.end().catch(() => {}); redis.disconnect(); process.exit(state.failures ? 1 : 0); });
