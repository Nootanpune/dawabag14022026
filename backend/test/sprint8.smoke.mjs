// Sprint 8 end-to-end smoke test — notifications (DLT SMS, FCM v1, devices, the
// delivery log), Shiprocket booking and tracking, and the small Sprint 8 gaps.
// Runs against throwaway fake providers; the API must use the same environment:
//
//   eval "$(node test/sprint8/fake-env.mjs)"
//   <start the API in this shell>
//   API_URL=http://localhost:4000 DATABASE_URL=postgresql://... REDIS_URL=redis://... node test/sprint8.smoke.mjs
import { db, redis, state } from './sprint5/lib.mjs';
import { startFakes } from './sprint8/fakes.mjs';
import { cleanup, setup } from './sprint8/fixtures.mjs';
import { runLogout, runNotifications } from './sprint8/notifications.mjs';
import { runCourier } from './sprint8/courier.mjs';
import { runGaps } from './sprint8/gaps.mjs';

let fakes;
async function main() {
  const need = ['MSG91_AUTH_KEY', 'MSG91_BASE_URL', 'FCM_SERVICE_ACCOUNT_JSON', 'SHIPROCKET_BASE_URL', 'SHIPROCKET_WEBHOOK_TOKEN'];
  const missing = need.filter((k) => !process.env[k]);
  if (missing.length) throw new Error(`Run with the fake provider environment (eval "$(node test/sprint8/fake-env.mjs)"); missing ${missing.join(', ')}`);
  fakes = await startFakes();
  await db.connect();
  await db.query("SET dawabag.maintenance = 'on'");   // clean-up deletes final records; the API never sets this
  await cleanup();
  const ctx = await setup();
  const a = await runNotifications(ctx);
  await runCourier(ctx, a);
  await runGaps(ctx);
  await runLogout(ctx);
  await cleanup();
  console.log(state.failures ? `\n${state.failures} check(s) FAILED` : '\nAll Sprint 8 checks passed');
}

main()
  .catch((e) => { state.failures++; console.error(e); })
  .finally(async () => { fakes?.close(); await db.end().catch(() => {}); redis.disconnect(); process.exit(state.failures ? 1 : 0); });
