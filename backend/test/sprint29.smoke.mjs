// Sprint 29 smoke test — draft catalogue products from partner new-product requests:
// requests → Create drafts (grouped, nothing clinical guessed) → invisible to buyers →
// pharmacist completes / approves / rejects / marks Schedule X → partner re-check
// matches the approved ones → apply puts only those on sale.
//
//   . scripts/dev-env.sh && scripts/dev-up.sh && node test/sprint29.smoke.mjs
import { db, redis, state } from './sprint5/lib.mjs';
import { cleanup, run, setup } from './sprint29/drafts.mjs';

async function main() {
  await db.connect();
  await db.query("SET ROLE dawabag_maintenance; SET dawabag.maintenance = 'on'");   // lets cleanup remove this run's audit rows
  await cleanup();
  try {
    await run(await setup());
  } finally { await cleanup(); }
  console.log(state.failures ? `\n${state.failures} check(s) FAILED` : '\nAll Sprint 29 checks passed');
}

main()
  .catch((e) => { state.failures++; console.error(e); })
  .finally(async () => { await db.end().catch(() => {}); redis.disconnect(); process.exit(state.failures ? 1 : 0); });
