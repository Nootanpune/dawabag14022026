// Sprint 13 end-to-end smoke test — own riders (C-26, C-41), GST period lock,
// WhatsApp updates for buyers who opted in.
//
//   eval "$(node test/fakes/fake-env.mjs)"
//   <start the API in this shell>
//   API_URL=http://localhost:4000 DATABASE_URL=postgresql://... REDIS_URL=redis://... node test/sprint13.smoke.mjs
import { db, redis, state } from './sprint5/lib.mjs';
import { startFakes } from './fakes/server.mjs';
import { cleanup, setup } from './sprint13/fixtures.mjs';
import { runRiders } from './sprint13/riders.mjs';
import { runAccountsLock } from './sprint13/accounts.mjs';
import { runWhatsApp } from './sprint13/whatsapp.mjs';

let fakes;
async function main() {
  if (!process.env.MSG91_WHATSAPP_NUMBER) throw new Error('Run with the fake provider environment (eval "$(node test/fakes/fake-env.mjs)")');
  fakes = await startFakes();
  await db.connect();
  await db.query("SET dawabag.maintenance = 'on'");
  await cleanup();
  const ctx = await setup();
  try {
    await runRiders(ctx);
    await runAccountsLock(ctx);
    await runWhatsApp(ctx);
  } finally { await cleanup(); }
  console.log(state.failures ? `\n${state.failures} check(s) FAILED` : '\nAll Sprint 13 checks passed');
}

main()
  .catch((e) => { state.failures++; console.error(e); })
  .finally(async () => { fakes?.close(); await db.end().catch(() => {}); redis.disconnect(); process.exit(state.failures ? 1 : 0); });
