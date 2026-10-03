// Sprint 37 smoke test — the live stock feed from a partner's billing software
// (MediVision on the partner's LAN, via a connector): automatic quantities, the
// check queue and its urgent badge, idempotent / ordered full snapshots, units held
// back for orders the partner has not billed, staleness, mode switch and keys
// (owner decisions 2026-10-03; C-05, C-16, C-25, C-27, C-44, C-46).
//
//   . scripts/dev-env.sh && scripts/dev-up.sh && node test/sprint37.smoke.mjs
import { db, redis, state } from './sprint5/lib.mjs';
import { cleanup, setup } from './sprint37/fixtures.mjs';
import { runLiveFeed } from './sprint37/liveFeed.mjs';

async function main() {
  await db.connect();
  await db.query("SET ROLE dawabag_maintenance; SET dawabag.maintenance = 'on'");   // lets cleanup remove this run's audit rows
  await cleanup();
  try {
    await setup();
    await runLiveFeed();
  } finally { await cleanup(); }
  console.log(state.failures ? `\n${state.failures} check(s) FAILED` : '\nAll Sprint 37 checks passed');
}

main()
  .catch((e) => { state.failures++; console.error(e); })
  .finally(async () => { await db.end().catch(() => {}); redis.disconnect(); process.exit(state.failures ? 1 : 0); });
