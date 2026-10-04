// Sprint 46 smoke test — catalogue suggestions imported for ONE partner's DRAFT products
// (owner request 2026-10-04): matched through that partner's own item links (the partner
// stock import's matcher, as in Sprint 45), stored on their own and shown to the
// pharmacist — never written into the product's decided fields; live products never
// touched; every product still decided and approved by a pharmacist one at a time
// (C-10, C-19, C-25); each import audited (C-46). Made-up demo items only.
//
//   . scripts/dev-env.sh && scripts/dev-up.sh && node test/sprint46.smoke.mjs
// Runs against the API at API_URL (connected as the restricted login, Sprint 41).
import { db, redis, state } from './sprint5/lib.mjs';
import { cleanup, setup } from './sprint46/fixtures.mjs';
import { runSuggestions } from './sprint46/suggestions.mjs';

async function main() {
  await db.connect();
  // Clean-up and the fixtures' direct writes act as the maintenance role (test database only)
  await db.query("SET ROLE dawabag_maintenance; SET dawabag.maintenance = 'on'");
  await cleanup();
  try {
    await setup();
    await runSuggestions();
  } finally { await cleanup(); }
  console.log(state.failures ? `\n${state.failures} check(s) FAILED` : '\nAll Sprint 46 checks passed');
}

main()
  .catch((e) => { state.failures++; console.error(e); })
  .finally(async () => { await db.end().catch(() => {}); redis.disconnect(); process.exit(state.failures ? 1 : 0); });
