// Sprint 43 smoke test — changing an order before packing (URS-074) and health details
// sealed at rest (URS-006, DPDP).
//   A. lower / remove lines while nothing is packed: credit note per seller, invoice
//      unchanged, reservations back (own and partner), refund now (paid) or right after the
//      capture (authorised only), the last prescription line removed → straight to packing,
//      cancel after a change credits only what is left, packing closes changes, the
//      database keeps removals and changes final
//   B. allergies / conditions / medicines sealed (AES-256-GCM, row-bound), plain columns
//      empty and refused, start-up sealing of older rows, a copied value does not open
//
//   . scripts/dev-env.sh && scripts/dev-up.sh && node test/sprint43.smoke.mjs
// Runs against the API at API_URL (connected as the restricted login, Sprint 41).
import { db, redis, state } from './sprint5/lib.mjs';
import { startFakes } from './fakes/server.mjs';
import { cleanup, setup } from './sprint43/fixtures.mjs';
import { runOrderEdit } from './sprint43/orderEdit.mjs';
import { runHealthSealing } from './sprint43/healthSealing.mjs';

// Built on the Sprint 39 fixtures, which set online-sale status and registrations themselves
state.sprint39Defaults = false;

let fakes;
async function main() {
  const missing = ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET', 'RAZORPAY_BASE_URL', 'MSG91_AUTH_KEY'].filter((k) => !process.env[k]);
  if (missing.length) throw new Error(`Run with the fake provider environment (. scripts/dev-env.sh); missing ${missing.join(', ')}`);
  fakes = await startFakes();
  await db.connect();
  // Clean-up and the fixtures' direct writes act as the maintenance role (test database only)
  await db.query("SET ROLE dawabag_maintenance; SET dawabag.maintenance = 'on'");
  await cleanup();
  try {
    await setup();
    await runOrderEdit();
    await runHealthSealing();
  } finally { await cleanup(); }
  console.log(state.failures ? `\n${state.failures} check(s) FAILED` : '\nAll Sprint 43 checks passed');
}

main()
  .catch((e) => { state.failures++; console.error(e); })
  .finally(async () => { fakes?.close(); await db.end().catch(() => {}); redis.disconnect(); process.exit(state.failures ? 1 : 0); });
