// Sprint 34 smoke test — fixes from the security review of Sprints 25–33
// (docs/security/review-sprint25-33.md), Schedule C / C1 per product (Form 21 / 21B,
// C-07, C-33), retention of dose answers and health profiles (C-43, C-44) and
// switched-off catalogue list entries in the import and the database.
// It starts one short-lived API process of its own (port 4134) for the upload limit.
//
//   . scripts/dev-env.sh && scripts/dev-up.sh && node test/sprint34.smoke.mjs
import { db, redis, state } from './sprint5/lib.mjs';
import { cleanup, setup } from './sprint34/fixtures.mjs';
import { runReview, runUploadLimit } from './sprint34/review.mjs';
import { runScheduleC } from './sprint34/scheduleC.mjs';
import { runLists } from './sprint34/lists.mjs';
import { runRetention } from './sprint34/retention.mjs';

async function main() {
  await db.connect();
  await db.query("SET dawabag.maintenance = 'on'");   // lets cleanup remove this run's audit rows
  await cleanup();
  try {
    await setup();
    await runReview();
    await runUploadLimit();
    await runScheduleC();
    await runLists();
    await runRetention();
  } finally { await cleanup(); }
  console.log(state.failures ? `\n${state.failures} check(s) FAILED` : '\nAll Sprint 34 checks passed');
}

main()
  .catch((e) => { state.failures++; console.error(e); })
  .finally(async () => { await db.end().catch(() => {}); redis.disconnect(); process.exit(state.failures ? 1 : 0); });
