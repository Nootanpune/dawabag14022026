// Sprint 38 smoke test — registers and integrity (handover gap analysis 2026-10-03):
// Schedule H1 register complete / gapless per seller licence / hash-chained, audit log
// chain, maintenance bypass closed to the API role, frozen prescriptions with an
// append-only dispense ledger and two clocks, the emergency stop for prescription
// medicines, no referral codes for doctors (C-08, C-09, C-20, C-34, C-46).
//
//   . scripts/dev-env.sh && scripts/dev-up.sh && node test/sprint38.smoke.mjs
import { db, redis, state } from './sprint5/lib.mjs';
import { cleanup, setup } from './sprint38/fixtures.mjs';
import { runAuditFailure, runChainVerify, runH1Refusal, runPartnerRegister } from './sprint38/registers.mjs';
import { closeProbe, runFrozenPrescription, runMaintenanceLockdown, runReferral } from './sprint38/integrity.mjs';
import { runEmergencyStop } from './sprint38/emergencyStop.mjs';

async function main() {
  await db.connect();
  // Clean-up and the tampering checks act as the maintenance role (test database only)
  await db.query("SET ROLE dawabag_maintenance; SET dawabag.maintenance = 'on'");
  await cleanup();
  try {
    await setup();
    await runH1Refusal();
    await runPartnerRegister();
    await runChainVerify();
    await runAuditFailure();
    await runMaintenanceLockdown();
    await runFrozenPrescription();
    await runEmergencyStop();
    await runReferral();
  } finally { await closeProbe(); await cleanup(); }
  console.log(state.failures ? `\n${state.failures} check(s) FAILED` : '\nAll Sprint 38 checks passed');
}

main()
  .catch((e) => { state.failures++; console.error(e); })
  .finally(async () => { await db.end().catch(() => {}); redis.disconnect(); process.exit(state.failures ? 1 : 0); });
