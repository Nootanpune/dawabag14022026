// Sprint 26 smoke test — the trial's demo payment (no money moves): same capture path
// as Razorpay, flagged demo in payments and the audit log, refunds settled without a
// gateway, and refused outside APP_ENV=trial (route 404 and config/env.ts).
//
//   . scripts/dev-env.sh && scripts/dev-up.sh && node test/sprint26.smoke.mjs
// It starts two short-lived API processes of its own (ports 4126–4128).
import { db, redis, state } from './sprint5/lib.mjs';
import { cleanup, runOutsideTrial, runRefusedConfigs, runTrialDemo, setup } from './sprint26/demoPayment.mjs';

async function main() {
  await db.connect();
  await db.query("SET dawabag.maintenance = 'on'");   // lets cleanup remove this run's audit rows
  await cleanup();
  try {
    const t = await setup();
    await runOutsideTrial(t);
    await runRefusedConfigs();
    await runTrialDemo(t);
  } finally { await cleanup(); }
  console.log(state.failures ? `\n${state.failures} check(s) FAILED` : '\nAll Sprint 26 checks passed');
}

main()
  .catch((e) => { state.failures++; console.error(e); })
  .finally(async () => { await db.end().catch(() => {}); redis.disconnect(); process.exit(state.failures ? 1 : 0); });
