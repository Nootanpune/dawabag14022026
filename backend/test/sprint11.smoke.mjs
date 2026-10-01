// Sprint 11 end-to-end smoke test — payments against a fake Razorpay: checkout,
// webhooks (signed, de-duplicated), refunds settled or retried, the reconciliation
// sweep, mandates and refill charges, and the settlement reconciliation report.
//
//   eval "$(node test/fakes/fake-env.mjs)"
//   <start the API in this shell>
//   API_URL=http://localhost:4000 DATABASE_URL=postgresql://... REDIS_URL=redis://... node test/sprint11.smoke.mjs
import { db, redis, state } from './sprint5/lib.mjs';
import { startFakes } from './fakes/server.mjs';
import { cleanup, setup } from './sprint11/fixtures.mjs';
import { runPayments } from './sprint11/payments.mjs';

let fakes;
async function main() {
  const missing = ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET', 'RAZORPAY_BASE_URL'].filter((k) => !process.env[k]);
  if (missing.length) throw new Error(`Run with the fake provider environment (eval "$(node test/fakes/fake-env.mjs)"); missing ${missing.join(', ')}`);
  fakes = await startFakes();
  await db.connect();
  await db.query("SET dawabag.maintenance = 'on'");   // clean-up deletes final records; the API never sets this
  await cleanup();
  const ctx = await setup();
  try { await runPayments(ctx); } finally { await cleanup(); }
  console.log(state.failures ? `\n${state.failures} check(s) FAILED` : '\nAll Sprint 11 checks passed');
}

main()
  .catch((e) => { state.failures++; console.error(e); })
  .finally(async () => { fakes?.close(); await db.end().catch(() => {}); redis.disconnect(); process.exit(state.failures ? 1 : 0); });
