// Sprint 22 smoke test — bulk pack-photo upload by SKU.
//
//   . scripts/dev-env.sh && scripts/dev-up.sh && node test/sprint22.smoke.mjs
// Runs without an object store (uploads answer 503). To run the full photo flow
// against the in-memory fake store, start the API and run this file in a shell with
//   export AWS_S3_BUCKET=dawabag-fake-bucket S3_ENDPOINT=http://127.0.0.1:$FAKE_PROVIDERS_PORT AWS_ACCESS_KEY_ID=fake AWS_SECRET_ACCESS_KEY=fake
import { db, redis, state } from './sprint5/lib.mjs';
import { cleanup, runBulkPhotos, setup } from './sprint22/bulkPhotos.mjs';
import { startFakes } from './fakes/server.mjs';

let fakes;
async function main() {
  fakes = await startFakes();
  await db.connect();
  await db.query("SET dawabag.maintenance = 'on'");   // lets cleanup remove this run's audit rows
  await cleanup();
  const ctx = await setup();
  try {
    await runBulkPhotos(ctx);
  } finally { await cleanup(); }
  console.log(state.failures ? `\n${state.failures} check(s) FAILED` : '\nAll Sprint 22 checks passed');
}

main()
  .catch((e) => { state.failures++; console.error(e); })
  .finally(async () => { fakes?.close(); await db.end().catch(() => {}); redis.disconnect(); process.exit(state.failures ? 1 : 0); });
