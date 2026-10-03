// Sprint 31 smoke test — "New products to complete": category and HSN lists with
// quick-create (Alt+C / "+ New" via the API), optional description for buyers
// (added later through the C-19 copy review) and the "Non-scheduled" schedule.
//
//   . scripts/dev-env.sh && scripts/dev-up.sh && node test/sprint31.smoke.mjs
import { db, redis, state } from './sprint5/lib.mjs';
import { cleanup, run, setup } from './sprint31/lists.mjs';

async function main() {
  await db.connect();
  await db.query("SET ROLE dawabag_maintenance; SET dawabag.maintenance = 'on'");   // lets cleanup remove this run's audit rows
  await cleanup();
  try {
    await run(await setup());
  } finally { await cleanup(); }
  console.log(state.failures ? `\n${state.failures} check(s) FAILED` : '\nAll Sprint 31 checks passed');
}

main()
  .catch((e) => { state.failures++; console.error(e); })
  .finally(async () => { await db.end().catch(() => {}); redis.disconnect(); process.exit(state.failures ? 1 : 0); });
