// Sprint 14 end-to-end smoke test — regulator recall / NSQ alerts (C-28) and the
// fixes from the Sprint 12–13 security review.
//
//   eval "$(node test/fakes/fake-env.mjs)"
//   <start the API in this shell>
//   API_URL=http://localhost:4000 DATABASE_URL=postgresql://... REDIS_URL=redis://... node test/sprint14.smoke.mjs
import { db, redis, state } from './sprint5/lib.mjs';
import { cleanup, setup } from './sprint14/fixtures.mjs';
import { runRecallAlerts } from './sprint14/recallAlerts.mjs';
import { runReviewFixes } from './sprint14/reviewFixes.mjs';
import { startFakes } from './fakes/server.mjs';

let fakes;
async function main() {
  if (!process.env.RAZORPAY_WEBHOOK_SECRET) throw new Error('Run with the fake provider environment (eval "$(node test/fakes/fake-env.mjs)")');
  fakes = await startFakes();
  await db.connect();
  await db.query("SET dawabag.maintenance = 'on'");
  await cleanup();
  const ctx = await setup();
  try {
    await runRecallAlerts(ctx);
    await runReviewFixes(ctx);
  } finally { await cleanup(); }
  console.log(state.failures ? `\n${state.failures} check(s) FAILED` : '\nAll Sprint 14 checks passed');
}

main()
  .catch((e) => { state.failures++; console.error(e); })
  .finally(async () => { fakes?.close(); await db.end().catch(() => {}); redis.disconnect(); process.exit(state.failures ? 1 : 0); });
