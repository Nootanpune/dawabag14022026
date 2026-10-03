// Sprint 39 smoke test — owner decisions 2026-10-03 (C-02, C-03, C-08, C-10, C-37, C-46):
//   prescription before payment and authorise-then-capture for prescription orders
//   (capture after the pharmacist check; refusal / cancellation / timeout releases the
//   hold — never charged; the trial's demo simulates the same), online-sale status per
//   product (new = restricted; X / NDPS never permitted), pharmacist registration validity
//   at the four gates, and partner batch provenance (optional, immutable, required mode).
//
//   . scripts/dev-env.sh && scripts/dev-up.sh && node test/sprint39.smoke.mjs
// It starts the fake providers in-process and a short-lived trial API on port 4139.
import { db, redis, state } from './sprint5/lib.mjs';
import { startFakes } from './fakes/server.mjs';
import { cleanup, setup } from './sprint39/fixtures.mjs';
import { runAuthoriseCapture, runDemoPath, runRefusalVoid, runRxBeforePayment, runTimeoutAndExpiry } from './sprint39/rxPayment.mjs';
import { runOnlineSaleStatus } from './sprint39/onlineSale.mjs';
import { runRegistrations } from './sprint39/registrations.mjs';
import { runProvenance } from './sprint39/provenance.mjs';

// This suite tests the Sprint 39 rules themselves: no stand-ins (support/sprint39Fixtures.mjs)
state.sprint39Defaults = false;

let fakes;
async function main() {
  const missing = ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET', 'RAZORPAY_BASE_URL'].filter((k) => !process.env[k]);
  if (missing.length) throw new Error(`Run with the fake provider environment (eval "$(node test/fakes/fake-env.mjs)"); missing ${missing.join(', ')}`);
  fakes = await startFakes();
  await db.connect();
  // Clean-up and the database checks act as the maintenance role (test database only)
  await db.query("SET ROLE dawabag_maintenance; SET dawabag.maintenance = 'on'");
  await cleanup();
  try {
    await setup();
    await runRegistrations();
    await runOnlineSaleStatus();
    await runRxBeforePayment();
    await runAuthoriseCapture();
    await runRefusalVoid();
    await runTimeoutAndExpiry();
    await runDemoPath();
    await runProvenance();
  } finally { await cleanup(); }
  console.log(state.failures ? `\n${state.failures} check(s) FAILED` : '\nAll Sprint 39 checks passed');
}

main()
  .catch((e) => { state.failures++; console.error(e); })
  .finally(async () => { fakes?.close(); await db.end().catch(() => {}); redis.disconnect(); process.exit(state.failures ? 1 : 0); });
