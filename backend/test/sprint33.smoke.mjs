// Sprint 33 smoke test — medicine information (versioned, pharmacist-reviewed, C-19),
// substitutes, delivery date / expiry / cold-chain lines, trust pages, dose reminders and
// the health profile (consent C-41, deletion C-43/C-44, pharmacist view C-08, audit C-46).
//
//   . scripts/dev-env.sh && scripts/dev-up.sh && node test/sprint33.smoke.mjs
import { db, redis, state } from './sprint5/lib.mjs';
import { cleanup, setup } from './sprint33/fixtures.mjs';
import { runMedicineInfo } from './sprint33/medicineInfo.mjs';
import { runDeliveryAndExpiry, runSubstitutes } from './sprint33/productPage.mjs';
import { runTrustPages } from './sprint33/trustPages.mjs';
import { runReminders } from './sprint33/reminders.mjs';
import { runHealthProfile } from './sprint33/healthProfile.mjs';

async function main() {
  await db.connect();
  await db.query("SET dawabag.maintenance = 'on'");   // lets cleanup remove this run's audit rows
  await cleanup();
  try {
    await setup();
    await runMedicineInfo();
    await runSubstitutes();
    await runDeliveryAndExpiry();
    await runTrustPages();
    await runReminders();
    await runHealthProfile();
  } finally { await cleanup(); }
  console.log(state.failures ? `\n${state.failures} check(s) FAILED` : '\nAll Sprint 33 checks passed');
}

main()
  .catch((e) => { state.failures++; console.error(e); })
  .finally(async () => { await db.end().catch(() => {}); redis.disconnect(); process.exit(state.failures ? 1 : 0); });
