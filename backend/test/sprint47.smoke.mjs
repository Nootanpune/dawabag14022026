// Sprint 47 smoke test — who may buy a product (owner request 2026-10-04): everyone (default,
// unchanged) / doctors and hospitals only (verified registration, Sprint 44; Drugs Rules 1945
// r.65(9)(b)) / licensed trade buyers only (checked, in-date drug licences, Sprint 30 / 32; C-14,
// C-33). Set only by a registered pharmacist with a reason, append-only log, audited (C-46);
// enforced by the server on search labels, product page, cart, order placement, lines added
// before the invoice and refills; "Who may buy" in the new-product form and the optional
// buyer_restriction column of the catalogue suggestions import. Made-up demo items only.
//
//   . scripts/dev-env.sh && scripts/dev-up.sh && node test/sprint47.smoke.mjs
// Runs against the API at API_URL (connected as the restricted login, Sprint 41).
import { db, redis, state } from './sprint5/lib.mjs';
import { cleanup, setup } from './sprint47/fixtures.mjs';
import { runRestriction } from './sprint47/restriction.mjs';
import { runDrafts } from './sprint47/drafts.mjs';

// The fixtures set online-sale status, registrations and written orders themselves
state.sprint39Defaults = false;

async function main() {
  await db.connect();
  // Clean-up and the fixtures' direct writes act as the maintenance role (test database only)
  await db.query("SET ROLE dawabag_maintenance; SET dawabag.maintenance = 'on'");
  await cleanup();
  try {
    await setup();
    await runRestriction();
    await runDrafts();
  } finally { await cleanup(); }
  console.log(state.failures ? `\n${state.failures} check(s) FAILED` : '\nAll Sprint 47 checks passed');
}

main()
  .catch((e) => { state.failures++; console.error(e); })
  .finally(async () => { await db.end().catch(() => {}); redis.disconnect(); process.exit(state.failures ? 1 : 0); });
