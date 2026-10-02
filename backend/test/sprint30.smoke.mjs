// Sprint 30 smoke test — drug licences for every party: partners (all 4 forms shown for
// the admin, in the portal and on a B2B invoice), suppliers (Form 25 + 20B), retailers
// (20 + 21) and wholesalers (20B + 21B), expiry blocks and renewals, duplicate numbers,
// expiry alerts and Dawabag's own register.
//
//   . scripts/dev-env.sh && scripts/dev-up.sh && node test/sprint30.smoke.mjs
import { db, redis, state } from './sprint5/lib.mjs';
import { cleanup, run, setup } from './sprint30/licences.mjs';

async function main() {
  await db.connect();
  await db.query("SET dawabag.maintenance = 'on'");   // lets cleanup remove this run's audit rows
  await cleanup();
  try {
    await run(await setup());
  } finally { await cleanup(); }
  console.log(state.failures ? `\n${state.failures} check(s) FAILED` : '\nAll Sprint 30 checks passed');
}

main()
  .catch((e) => { state.failures++; console.error(e); })
  .finally(async () => { await db.end().catch(() => {}); redis.disconnect(); process.exit(state.failures ? 1 : 0); });
