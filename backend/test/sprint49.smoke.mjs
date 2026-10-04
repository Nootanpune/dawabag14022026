// Sprint 49 smoke test — Admin → Launch readiness (the live docs/LAUNCH_CHECKLIST.md):
//   computed items move exactly with known fixtures (pharmacists — Dawabag and partners — two-step
//   sign-in, doctor registrations, products: live / drafts / suggestions / medicine information /
//   buyer restriction / online-sale status / Schedule C-C1, webhook events, backups, cold-chain
//   couriers); manual items changed by admins only, audited, guarded in the database; no secret
//   value in any answer (C-41, C-44, C-46).
//
//   . scripts/dev-env.sh && scripts/dev-up.sh && node test/sprint49.smoke.mjs
// Runs against the API at API_URL (connected as the restricted login, Sprint 41). Made-up test
// data only (mobiles 90000049xx, SKUs S49-); removed by cleanup().
import { db, redis, state } from './sprint5/lib.mjs';
import { cleanup } from './sprint49/fixtures.mjs';
import { runReadiness } from './sprint49/readiness.mjs';

state.sprint39Defaults = false;

async function main() {
  await db.connect();
  await db.query("SET ROLE dawabag_maintenance; SET dawabag.maintenance = 'on'");
  await cleanup();
  try {
    await runReadiness();
  } finally {
    await cleanup();
  }
  console.log(state.failures ? `\n${state.failures} check(s) FAILED` : '\nAll Sprint 49 checks passed');
}

main()
  .catch((e) => { state.failures++; console.error(e); })
  .finally(async () => { await db.end().catch(() => {}); redis.disconnect(); process.exit(state.failures ? 1 : 0); });
