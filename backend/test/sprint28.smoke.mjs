// Sprint 28 smoke test — Dawabag's admin onboards a partner pharmacy (GSTIN and
// licence checks, licences + pharmacists + logins in one transaction, forced password
// change at first sign-in), then the partner uploads stock and lists.
//
//   . scripts/dev-env.sh && scripts/dev-up.sh && node test/sprint28.smoke.mjs
import { db, redis, state } from './sprint5/lib.mjs';
import { cleanup, run, setup } from './sprint28/onboarding.mjs';

async function main() {
  await db.connect();
  await db.query("SET dawabag.maintenance = 'on'");   // lets cleanup remove this run's audit rows
  await cleanup();
  try {
    await run(await setup());
  } finally { await cleanup(); }
  console.log(state.failures ? `\n${state.failures} check(s) FAILED` : '\nAll Sprint 28 checks passed');
}

main()
  .catch((e) => { state.failures++; console.error(e); })
  .finally(async () => { await db.end().catch(() => {}); redis.disconnect(); process.exit(state.failures ? 1 : 0); });
