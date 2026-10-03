// Sprint 44 smoke test —
//   A. changing an order before the pharmacist's approval (owner decision CONFIRMED 2026-10-03):
//      raise / add (OTC and prescription), prescription → back to the check, second payment
//      before approval, no change after the invoice;
//   B. the tax invoice issued at the pharmacist's approval, numbering gap-free, invoices issued
//      before untouched, the database keeping it so;
//   C. sales to doctors / institutions — FDA Maharashtra (Pune Division) circular No.
//      Drug/Wholesalers Memo./16/2026/1 (30-09-2026), Drugs Rules 1945 r.64(2), r.65(9)(b):
//      verified registration with the certificate copy, signed written order (final), the
//      pharmacist named on the sale, the register with links and CSV.
//
//   . scripts/dev-env.sh && scripts/dev-up.sh && node test/sprint44.smoke.mjs
// Runs against the API at API_URL (connected as the restricted login, Sprint 41).
import { db, redis, state } from './sprint5/lib.mjs';
import { startFakes } from './fakes/server.mjs';
import { cleanup, setup } from './sprint44/fixtures.mjs';
import { runOrderEdit } from './sprint44/orderEdit.mjs';
import { runInvoiceAtApproval } from './sprint44/invoiceAtApproval.mjs';
import { runPractitioner } from './sprint44/practitioner.mjs';

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
    await runInvoiceAtApproval();
    await runPractitioner();
  } finally { await cleanup(); }
  console.log(state.failures ? `\n${state.failures} check(s) FAILED` : '\nAll Sprint 44 checks passed');
}

main()
  .catch((e) => { state.failures++; console.error(e); })
  .finally(async () => { fakes?.close(); await db.end().catch(() => {}); redis.disconnect(); process.exit(state.failures ? 1 : 0); });
