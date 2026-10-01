// Sprint 6 end-to-end smoke test — beta readiness: security-review regressions,
// readiness endpoint, catalogue workbook import, final statutory records,
// accountant reports, saved prescription reuse, cold-chain dispatch, incidents.
//
//   API_URL=http://localhost:4000 DATABASE_URL=postgresql://... REDIS_URL=redis://... \
//     node test/sprint6.smoke.mjs
//
// Needs DISABLE_SCHEDULER=true and no Razorpay keys on the API. Test data is
// cleaned up before and after. NEVER point it at a production database.
import { db, redis, state } from './sprint5/lib.mjs';
import { cleanup, setup } from './sprint6/fixtures.mjs';
import { runSecurity } from './sprint6/security.mjs';
import { runOperations } from './sprint6/operations.mjs';

async function main() {
  await db.connect();
  // Test clean-up may delete final records; the API never sets this
  await db.query("SET dawabag.maintenance = 'on'");
  await cleanup();
  const ctx = await setup();
  await runSecurity(ctx);
  await runOperations(ctx);
  await cleanup();
  console.log(state.failures ? `\n${state.failures} check(s) FAILED` : '\nAll Sprint 6 checks passed');
}

main()
  .catch((e) => { state.failures++; console.error(e); })
  .finally(async () => { await db.end(); redis.disconnect(); process.exit(state.failures ? 1 : 0); });
