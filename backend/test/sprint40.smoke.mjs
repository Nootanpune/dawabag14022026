// Sprint 40 smoke test — GDP records per batch with excursion holds (D17/D19, C-25), product
// class and new drugs (D6, C-10), mock recall drills (O15, C-28), the self-inspection
// register (O15, C-34), recorded chain heads with the nightly chain check (C-09, C-46),
// the partner's batch-supplier page, and plain "SMS not configured" answers for sign-in codes.
//
//   . scripts/dev-env.sh && scripts/dev-up.sh && node test/sprint40.smoke.mjs
// It starts the fake providers in-process and a short-lived API without MSG91 on port 4140.
import { db, redis, state } from './sprint5/lib.mjs';
import { startFakes } from './fakes/server.mjs';
import { cleanup, setup } from './sprint40/fixtures.mjs';
import { runGdp } from './sprint40/gdp.mjs';
import { runProductClass } from './sprint40/productClass.mjs';
import { runDrill } from './sprint40/drill.mjs';
import { runSelfInspection } from './sprint40/selfInspection.mjs';
import { runIntegrity } from './sprint40/integrity.mjs';
import { runSmsNotConfigured } from './sprint40/sms.mjs';
import { runBatchSuppliers } from './sprint40/provenance.mjs';

// This suite sets online-sale status and registrations itself: no Sprint 39 stand-ins
state.sprint39Defaults = false;

let fakes;
async function main() {
  fakes = await startFakes();
  await db.connect();
  // Clean-up and the database checks act as the maintenance role (test database only)
  await db.query("SET ROLE dawabag_maintenance; SET dawabag.maintenance = 'on'");
  await cleanup();
  try {
    await setup();
    await runGdp();
    await runProductClass();
    await runDrill();
    await runSelfInspection();
    await runIntegrity();
    await runBatchSuppliers();
    await runSmsNotConfigured();
  } finally { await cleanup(); }
  console.log(state.failures ? `\n${state.failures} check(s) FAILED` : '\nAll Sprint 40 checks passed');
}

main()
  .catch((e) => { state.failures++; console.error(e); })
  .finally(async () => { fakes?.close(); await db.end().catch(() => {}); redis.disconnect(); process.exit(state.failures ? 1 : 0); });
