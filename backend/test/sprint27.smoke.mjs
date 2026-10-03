// Sprint 27 smoke test — partner stock import from billing software (MediVision
// Platinum / any Excel or CSV export): upload → columns → preview → link → apply into
// the partner's own ledger → availability; apply twice refused; other partner refused.
//
//   . scripts/dev-env.sh && scripts/dev-up.sh && node test/sprint27.smoke.mjs
import { db, redis, state } from './sprint5/lib.mjs';
import { cleanup, run, setup } from './sprint27/stockImport.mjs';

async function main() {
  await db.connect();
  await db.query("SET ROLE dawabag_maintenance; SET dawabag.maintenance = 'on'");   // lets cleanup remove this run's audit rows
  await cleanup();
  try {
    await run(await setup());
  } finally { await cleanup(); }
  console.log(state.failures ? `\n${state.failures} check(s) FAILED` : '\nAll Sprint 27 checks passed');
}

main()
  .catch((e) => { state.failures++; console.error(e); })
  .finally(async () => { await db.end().catch(() => {}); redis.disconnect(); process.exit(state.failures ? 1 : 0); });
