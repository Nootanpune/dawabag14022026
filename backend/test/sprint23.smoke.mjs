// Sprint 23 smoke test — forgiving product search and the free-delivery amount.
//
//   . scripts/dev-env.sh && scripts/dev-up.sh && node test/sprint23.smoke.mjs
import { db, redis, state } from './sprint5/lib.mjs';
import { cleanup, runDeliveryOffer, runSearch, setup } from './sprint23/search.mjs';

async function main() {
  await db.connect();
  await db.query("SET dawabag.maintenance = 'on'");   // lets cleanup remove this run's audit rows
  await cleanup();
  try {
    await setup();
    await runSearch();
    await runDeliveryOffer();
  } finally { await cleanup(); }
  console.log(state.failures ? `\n${state.failures} check(s) FAILED` : '\nAll Sprint 23 checks passed');
}

main()
  .catch((e) => { state.failures++; console.error(e); })
  .finally(async () => { await db.end().catch(() => {}); redis.disconnect(); process.exit(state.failures ? 1 : 0); });
