// Sprint 9 end-to-end smoke test — GST e-invoicing against a fake IRP (C-31),
// 16-character document numbers (CGST Rule 46) and purchase returns (C-28).
//
//   eval "$(node test/fakes/fake-env.mjs)"
//   <start the API in this shell>
//   API_URL=http://localhost:4000 DATABASE_URL=postgresql://... REDIS_URL=redis://... node test/sprint9.smoke.mjs
import { db, redis, state } from './sprint5/lib.mjs';
import { startFakes } from './fakes/server.mjs';
import { cleanup, setup } from './sprint9/fixtures.mjs';
import { runEinvoice } from './sprint9/einvoice.mjs';
import { runReturns } from './sprint9/returns.mjs';

let fakes;
async function main() {
  const missing = ['IRP_BASE_URL', 'IRP_PUBLIC_KEY', 'FAKE_IRP_PRIVATE_KEY'].filter((k) => !process.env[k]);
  if (missing.length) throw new Error(`Run with the fake provider environment (eval "$(node test/fakes/fake-env.mjs)"); missing ${missing.join(', ')}`);
  fakes = await startFakes();
  await db.connect();
  await db.query("SET dawabag.maintenance = 'on'");   // clean-up deletes final records; the API never sets this
  await cleanup();
  const ctx = await setup();
  try {
    await runEinvoice(ctx);
    await runReturns(ctx);
  } finally {
    await cleanup();   // also restores the settings this suite changed
  }
  console.log(state.failures ? `\n${state.failures} check(s) FAILED` : '\nAll Sprint 9 checks passed');
}

main()
  .catch((e) => { state.failures++; console.error(e); })
  .finally(async () => { fakes?.close(); await db.end().catch(() => {}); redis.disconnect(); process.exit(state.failures ? 1 : 0); });
