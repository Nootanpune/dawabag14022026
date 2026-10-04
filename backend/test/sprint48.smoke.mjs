// Sprint 48 smoke test — the fixes from the security review of Sprints 41–47
// (docs/security/review-sprint41-47.md):
//   A. money and approvals around order changes: one change paid once (#1); approvals take the
//      order lock and refuse an order changed since it was shown (#2); the buyer's standing
//      checked again at the approval (#3); a settled credit order cannot grow (#7);
//   B. attempt limits under parallel requests — sign-in codes, authenticator codes, the written
//      order's password (#4); a super-admin's two-step reset ends sessions (#9); doctor
//      registrations decided by admins only (#6); start-up sealing of health details (#8).
//
//   . scripts/dev-env.sh && scripts/dev-up.sh && node test/sprint48.smoke.mjs
// Runs against the API at API_URL (connected as the restricted login, Sprint 41). Made-up test
// data only (the Sprint 39/44 fixtures: mobiles 90000039xx, SKUs S39-); removed by cleanup().
import { db, redis, state } from './sprint5/lib.mjs';
import { startFakes } from './fakes/server.mjs';
import { cleanup, setup } from './sprint44/fixtures.mjs';
import { runMoney } from './sprint48/money.mjs';
import { runAuth } from './sprint48/auth.mjs';

state.sprint39Defaults = false;

let fakes;
async function main() {
  const missing = ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET', 'RAZORPAY_BASE_URL', 'MSG91_AUTH_KEY'].filter((k) => !process.env[k]);
  if (missing.length) throw new Error(`Run with the fake provider environment (. scripts/dev-env.sh); missing ${missing.join(', ')}`);
  fakes = await startFakes();
  await db.connect();
  await db.query("SET ROLE dawabag_maintenance; SET dawabag.maintenance = 'on'");
  await cleanup();
  try {
    await setup();
    await runMoney();
    await runAuth();
  } finally {
    await db.query(`DELETE FROM user_recovery_codes WHERE user_id IN (SELECT id FROM users WHERE mobile LIKE '90000039%')`).catch(() => {});
    await db.query(`DELETE FROM user_two_factor WHERE user_id IN (SELECT id FROM users WHERE mobile LIKE '90000039%')`).catch(() => {});
    await cleanup();
  }
  console.log(state.failures ? `\n${state.failures} check(s) FAILED` : '\nAll Sprint 48 checks passed');
}

main()
  .catch((e) => { state.failures++; console.error(e); })
  .finally(async () => { fakes?.close(); await db.end().catch(() => {}); redis.disconnect(); process.exit(state.failures ? 1 : 0); });
