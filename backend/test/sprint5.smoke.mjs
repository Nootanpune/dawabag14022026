// Sprint 5 end-to-end smoke test — after-sale care and consumer protection:
// cancellation, refunds, credit notes, returns, partner deductions, checkout
// disclosure, policies, product declarations and copy review, delivery
// handover, side-effect reports, licence register, addresses.
//
//   API_URL=http://localhost:4000 DATABASE_URL=postgresql://... REDIS_URL=redis://... \
//     node test/sprint5.smoke.mjs
//
// Needs DISABLE_SCHEDULER=true and the fake providers (eval "$(node test/fakes/fake-env.mjs)"):
// gateway refunds go to the fake Razorpay. Test data is cleaned up before and
// after. NEVER point it at a production database.
import { db, redis, state } from './sprint5/lib.mjs';
import { startFakes } from './fakes/server.mjs';
import { cleanup, setup } from './sprint5/fixtures.mjs';
import { runCompliance } from './sprint5/compliance.mjs';
import { runAftercare } from './sprint5/aftercare.mjs';
import { runFreeDelivery } from './sprint5/freeDelivery.mjs';
import { runPartnerStock } from './sprint5/partnerStock.mjs';
import { runConcurrentCheckout } from './sprint5/concurrentCheckout.mjs';

let fakes;
async function main() {
  fakes = await startFakes();
  await db.connect();
  // Test clean-up may delete final records (H1, credit notes, audit); the API never sets this
  await db.query("SET ROLE dawabag_maintenance; SET dawabag.maintenance = 'on'");
  await cleanup();
  const ctx = await setup();
  await runCompliance(ctx);
  await runAftercare(ctx);
  await runFreeDelivery(ctx);
  await runPartnerStock(ctx);
  await runConcurrentCheckout(ctx);
  await cleanup();
  console.log(state.failures ? `\n${state.failures} check(s) FAILED` : '\nAll Sprint 5 checks passed');
}

main()
  .catch((e) => { state.failures++; console.error(e); })
  .finally(async () => { fakes?.close(); await db.end(); redis.disconnect(); process.exit(state.failures ? 1 : 0); });
