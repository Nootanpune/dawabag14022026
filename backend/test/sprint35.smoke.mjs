// Sprint 35 smoke test — a registered pharmacist checks and releases every order before
// packing (owner decision 2026-10-02, C-08, C-37, C-46), the trust page that says so,
// and "Forgot password" by OTP for the restyled sign-in pages.
//
//   . scripts/dev-env.sh && scripts/dev-up.sh && node test/sprint35.smoke.mjs
import { db, redis, state } from './sprint5/lib.mjs';
import { cleanup, setup } from './sprint35/fixtures.mjs';
import { runCreditOrder, runOwnOrder, runPartner, runReject, runRxOrder, runTrustPage } from './sprint35/check.mjs';
import { runPasswordReset } from './sprint35/passwordReset.mjs';

async function main() {
  await db.connect();
  await db.query("SET ROLE dawabag_maintenance; SET dawabag.maintenance = 'on'");   // lets cleanup remove this run's audit rows
  await cleanup();
  try {
    await setup();
    await runOwnOrder();
    await runCreditOrder();
    await runRxOrder();
    await runReject();
    await runPartner();
    await runTrustPage();
    await runPasswordReset();
  } finally { await cleanup(); }
  console.log(state.failures ? `\n${state.failures} check(s) FAILED` : '\nAll Sprint 35 checks passed');
}

main()
  .catch((e) => { state.failures++; console.error(e); })
  .finally(async () => { await db.end().catch(() => {}); redis.disconnect(); process.exit(state.failures ? 1 : 0); });
