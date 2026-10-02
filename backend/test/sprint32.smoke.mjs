// Sprint 32 smoke test — selling rights by licence and buyer type (retail: Form 20/21,
// trade: Form 20B/21B, partners and Dawabag's own register), trade prices that follow
// the buyer's licence live, notifications deleted mid-dispatch without crashing the
// API, and Admin → Catalogue lists (rename, correct, switch off / on).
//
//   . scripts/dev-env.sh && scripts/dev-up.sh && node test/sprint32.smoke.mjs
import { db, redis, state } from './sprint5/lib.mjs';
import { cleanup, setup } from './sprint32/fixtures.mjs';
import { livePrices, rights } from './sprint32/rights.mjs';
import { dispatch } from './sprint32/dispatch.mjs';
import { lists } from './sprint32/lists.mjs';

async function main() {
  await db.connect();
  await db.query("SET dawabag.maintenance = 'on'");   // lets cleanup remove this run's audit rows
  await cleanup();
  try {
    const ctx = await setup();
    await rights(ctx);
    await livePrices(ctx);
    await lists(ctx);
    await dispatch(ctx);
  } finally { await cleanup(); }
  console.log(state.failures ? `\n${state.failures} check(s) FAILED` : '\nAll Sprint 32 checks passed');
}

main()
  .catch((e) => { state.failures++; console.error(e); })
  .finally(async () => { await db.end().catch(() => {}); redis.disconnect(); process.exit(state.failures ? 1 : 0); });
