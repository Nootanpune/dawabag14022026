// Sprint 45 smoke test — medicine-information drafts written outside Dawabag, imported
// for ONE partner's products (owner request 2026-10-03): matched through that partner's
// own item links, imported as DRAFTS only, checked and sent by a registered pharmacist,
// approved by a SECOND one (Sprint 36 four eyes, C-19); approved / pending text never
// touched; each import audited without content (C-46). Made-up demo items only.
//
//   . scripts/dev-env.sh && scripts/dev-up.sh && node test/sprint45.smoke.mjs
// Runs against the API at API_URL (connected as the restricted login, Sprint 41).
import { db, redis, state } from './sprint5/lib.mjs';
import { cleanup, setup } from './sprint45/fixtures.mjs';
import { runImportDrafts } from './sprint45/importDrafts.mjs';

async function main() {
  await db.connect();
  // Clean-up and the fixtures' direct writes act as the maintenance role (test database only)
  await db.query("SET ROLE dawabag_maintenance; SET dawabag.maintenance = 'on'");
  await cleanup();
  try {
    await setup();
    await runImportDrafts();
  } finally { await cleanup(); }
  console.log(state.failures ? `\n${state.failures} check(s) FAILED` : '\nAll Sprint 45 checks passed');
}

main()
  .catch((e) => { state.failures++; console.error(e); })
  .finally(async () => { await db.end().catch(() => {}); redis.disconnect(); process.exit(state.failures ? 1 : 0); });
