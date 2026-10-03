// Sprint 7 end-to-end smoke test — purchasing and stock control: suppliers,
// purchase orders, goods receipts and their rules, purchase register and stock
// valuation, two-person adjustments, destruction register, expiry watch, stock counts.
//
//   API_URL=http://localhost:4000 DATABASE_URL=postgresql://... REDIS_URL=redis://... \
//     node test/sprint7.smoke.mjs
import { db, redis, state } from './sprint5/lib.mjs';
import { cleanup, setup } from './sprint7/fixtures.mjs';
import { runPurchasing } from './sprint7/purchasing.mjs';
import { runStock } from './sprint7/stock.mjs';

async function main() {
  await db.connect();
  await db.query("SET ROLE dawabag_maintenance; SET dawabag.maintenance = 'on'");   // clean-up deletes final records; the API never sets this
  await cleanup();
  const ctx = await setup();
  const made = await runPurchasing(ctx);
  await runStock(ctx, made);
  await cleanup();
  console.log(state.failures ? `\n${state.failures} check(s) FAILED` : '\nAll Sprint 7 checks passed');
}

main()
  .catch((e) => { state.failures++; console.error(e); })
  .finally(async () => { await db.end(); redis.disconnect(); process.exit(state.failures ? 1 : 0); });
