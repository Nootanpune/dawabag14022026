// Sprint 12 end-to-end smoke test — policies in Marathi and Hindi with consent
// citing the notice shown (C-40), and the retention purge (C-44).
//
//   API_URL=http://localhost:4000 DATABASE_URL=postgresql://... REDIS_URL=redis://... node test/sprint12.smoke.mjs
import { db, redis, state } from './sprint5/lib.mjs';
import { cleanup, setup } from './sprint12/fixtures.mjs';
import { runLanguage } from './sprint12/language.mjs';
import { runRetention } from './sprint12/retention.mjs';

async function main() {
  await db.connect();
  await db.query("SET ROLE dawabag_maintenance; SET dawabag.maintenance = 'on'");   // clean-up deletes final records; the API never sets this
  await cleanup();
  const ctx = await setup();
  try {
    await runLanguage(ctx);
    await runRetention(ctx);
  } finally { await cleanup(); }
  console.log(state.failures ? `\n${state.failures} check(s) FAILED` : '\nAll Sprint 12 checks passed');
}

main()
  .catch((e) => { state.failures++; console.error(e); })
  .finally(async () => { await db.end().catch(() => {}); redis.disconnect(); process.exit(state.failures ? 1 : 0); });
