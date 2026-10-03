// Sprint 36 smoke test — merging duplicate categories / HSN codes (Admin → Catalogue
// lists), partner stock-feed API keys (the billing software uploads through the same
// import pipeline), and four-eyes approval of medicine information (C-19, C-44, C-46).
//
//   . scripts/dev-env.sh && scripts/dev-up.sh && node test/sprint36.smoke.mjs
import { db, redis, state } from './sprint5/lib.mjs';
import { cleanup, setup } from './sprint36/fixtures.mjs';
import { runCategoryMerge, runHsnMerge } from './sprint36/merge.mjs';
import { runFeedKeys } from './sprint36/feedKeys.mjs';
import { runMedicineInfoFourEyes } from './sprint36/medicineInfo.mjs';

async function main() {
  await db.connect();
  await db.query("SET dawabag.maintenance = 'on'");   // lets cleanup remove this run's audit rows
  await cleanup();
  try {
    await setup();
    await runCategoryMerge();
    await runHsnMerge();
    await runFeedKeys();
    await runMedicineInfoFourEyes();
  } finally { await cleanup(); }
  console.log(state.failures ? `\n${state.failures} check(s) FAILED` : '\nAll Sprint 36 checks passed');
}

main()
  .catch((e) => { state.failures++; console.error(e); })
  .finally(async () => { await db.end().catch(() => {}); redis.disconnect(); process.exit(state.failures ? 1 : 0); });
