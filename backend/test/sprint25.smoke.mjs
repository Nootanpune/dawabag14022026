// Sprint 25 smoke test — shop like Amazon: search sort / "did you mean", cart
// "Buy again" and "Cheaper option", prescription uploaded without an order.
//
//   . scripts/dev-env.sh && scripts/dev-up.sh && node test/sprint25.smoke.mjs
import { db, redis, state } from './sprint5/lib.mjs';
import { cleanup, runCartSuggestions, runSearchExtras, runStandalonePrescription, setup } from './sprint25/shop.mjs';

async function main() {
  await db.connect();
  await db.query("SET ROLE dawabag_maintenance; SET dawabag.maintenance = 'on'");   // lets cleanup remove this run's audit rows
  await cleanup();
  try {
    const t = await setup();
    await runSearchExtras();
    await runCartSuggestions(t);
    await runStandalonePrescription(t);
  } finally { await cleanup(); }
  console.log(state.failures ? `\n${state.failures} check(s) FAILED` : '\nAll Sprint 25 checks passed');
}

main()
  .catch((e) => { state.failures++; console.error(e); })
  .finally(async () => { await db.end().catch(() => {}); redis.disconnect(); process.exit(state.failures ? 1 : 0); });
