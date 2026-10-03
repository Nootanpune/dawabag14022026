// Sprint 10 end-to-end smoke test — teleconsultation under the Telemedicine
// Practice Guidelines 2020 (C-22, C-23, C-24), the fee through a fake Razorpay.
//
//   eval "$(node test/fakes/fake-env.mjs)"
//   <start the API in this shell>
//   API_URL=http://localhost:4000 DATABASE_URL=postgresql://... REDIS_URL=redis://... node test/sprint10.smoke.mjs
import { db, redis, state } from './sprint5/lib.mjs';
import { startFakes } from './fakes/server.mjs';
import { cleanup, setup } from './sprint10/fixtures.mjs';
import { runTelemedicine } from './sprint10/telemedicine.mjs';

let fakes;
async function main() {
  const missing = ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_BASE_URL'].filter((k) => !process.env[k]);
  if (missing.length) throw new Error(`Run with the fake provider environment (eval "$(node test/fakes/fake-env.mjs)"); missing ${missing.join(', ')}`);
  fakes = await startFakes();
  await db.connect();
  await db.query("SET ROLE dawabag_maintenance; SET dawabag.maintenance = 'on'");   // clean-up deletes final records; the API never sets this
  await cleanup();
  const ctx = await setup();
  try { await runTelemedicine(ctx); } finally { await cleanup(); }
  console.log(state.failures ? `\n${state.failures} check(s) FAILED` : '\nAll Sprint 10 checks passed');
}

main()
  .catch((e) => { state.failures++; console.error(e); })
  .finally(async () => { fakes?.close(); await db.end().catch(() => {}); redis.disconnect(); process.exit(state.failures ? 1 : 0); });
