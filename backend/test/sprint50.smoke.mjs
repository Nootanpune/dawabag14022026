// Sprint 50 smoke test — production deployment kit, the parts that live in the API:
//   • the hourly job ops_watch is registered and, run now, agrees with the database: it FAILS
//     (and so alerts admins once, job_failed) when the newest backup attempt failed, and the
//     message names the problem; with a fresh good backup that problem is gone;
//   • Admin → Launch readiness shows the four production manual items seeded by migration 45.
//
//   . scripts/dev-env.sh && scripts/dev-up.sh && node test/sprint50.smoke.mjs
// Runs against the API at API_URL. Made-up test data only (mobile 9000005001, backup keys s50/…);
// removed by cleanup(). Global state on a shared development database (other backups, chain
// heads) is read first, so the checks hold whatever else is there.
import { call, check, db, login, q, redis, signUp, state } from './sprint5/lib.mjs';

state.sprint39Defaults = false;
const ADMIN = { customer_type: 'customer', full_name: 'S50 Super Admin', mobile: '9000005001', password: 'Passw0rd!',
  accept_privacy_notice: true, age_confirmed: true };

async function cleanup() {
  const users = (await q('SELECT id FROM users WHERE mobile = $1', [ADMIN.mobile])).map((r) => r.id);
  await q(`DELETE FROM job_runs WHERE job_name = 'db_backup' AND summary->>'key' LIKE 's50/%'`);
  await q(`UPDATE job_runs SET triggered_by = NULL WHERE triggered_by = ANY($1)`, [users]).catch(() => {});
  await q('UPDATE launch_checklist_items SET updated_by = NULL WHERE updated_by = ANY($1)', [users]);
  await q('DELETE FROM audit_logs WHERE performed_by = ANY($1) OR user_id = ANY($1)', [users]);
  for (const tbl of ['notification_deliveries', 'notifications', 'consent_records', 'user_profiles']) {
    await q(`DELETE FROM ${tbl} WHERE user_id = ANY($1)`, [users]);
  }
  await q('DELETE FROM users WHERE id = ANY($1)', [users]);
}

const runOps = async (token) => call('POST', '/admin/jobs/ops_watch/run', { token });

async function main() {
  await db.connect();
  await db.query("SET ROLE dawabag_maintenance; SET dawabag.maintenance = 'on'");
  await cleanup();
  try {
    const id = (await signUp(ADMIN)).user_id;
    await q(`UPDATE users SET role = 'super_admin' WHERE id = $1`, [id]);
    const admin = await login(ADMIN);

    const jobs = await call('GET', '/admin/jobs', { token: admin });
    const listed = JSON.stringify(jobs.json).includes('ops_watch');
    check('ops_watch is listed in Admin → Jobs', jobs.status === 200 && listed, jobs.status);

    // A failed backup attempt newer than any good one: the watch must fail and say so
    await q(`INSERT INTO job_runs (job_name, started_at, finished_at, status, summary, error)
             VALUES ('db_backup', NOW() + INTERVAL '1 minute', NOW() + INTERVAL '2 minutes', 'failed', '{"key": "s50/daily/failed.dump"}', 'smoke fixture')`);
    const before = (await q(`SELECT status FROM job_runs WHERE job_name = 'ops_watch' AND status <> 'running' ORDER BY started_at DESC LIMIT 1`))[0];
    const failed = await runOps(admin);
    const run = (await q(`SELECT status, error FROM job_runs WHERE job_name = 'ops_watch' ORDER BY started_at DESC LIMIT 1`))[0];
    check('a failed backup attempt makes ops_watch fail (so admins are alerted)', failed.status === 200 && run?.status === 'failed'
      && /backup attempt FAILED/.test(run?.error ?? ''), { http: failed.status, run });
    if (before?.status !== 'failed') {
      // First failure after a good run: every admin is told once (queued; arrives within seconds)
      let told = 0;
      for (let i = 0; i < 20 && !told; i++) {
        told = (await q(`SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND type = 'job_failed'`, [id]))[0].n;
        if (!told) await new Promise((r) => setTimeout(r, 500));
      }
      check('…and the admin is alerted once (job_failed)', told === 1, told);
    } else {
      console.log('  skip alert check — the previous ops_watch run had already failed (one alert per failing spell)');
    }
    check('…with a plain message and no secret value', !/AKIA|rzp_|BACKUP_ENC_KEY=/.test(run?.error ?? ''), run?.error);

    // A good backup after it: the backup problem is gone (other problems, e.g. an old integrity
    // check on this development database, may remain — they must match the database)
    await q(`INSERT INTO job_runs (job_name, started_at, finished_at, status, summary)
             VALUES ('db_backup', NOW() + INTERVAL '3 minutes', NOW() + INTERVAL '4 minutes', 'succeeded', '{"key": "s50/daily/ok.dump", "bytes": 1, "tier": "daily"}')`);
    await runOps(admin);
    const after = (await q(`SELECT status, error FROM job_runs WHERE job_name = 'ops_watch' ORDER BY started_at DESC LIMIT 1`))[0];
    const chain = (await q(`SELECT MAX(recorded_at) AS at FROM chain_heads`))[0].at;
    const chainOld = chain && Date.now() - new Date(chain).getTime() > 48 * 3600_000;
    check('with a fresh good backup the backup problem is gone', !/backup/i.test(after?.error ?? ''), after);
    check('the watch agrees with the integrity-check age in the database',
      chainOld ? after?.status === 'failed' && /record-integrity check last ran/.test(after.error) : after?.status === 'succeeded', { after, chain });

    const page = await call('GET', '/admin/launch-readiness', { token: admin });
    const items = (page.json.data?.sections ?? []).flatMap((s) => s.items);
    const prod = ['4.10', '4.11', '4.12', '4.13'].map((k) => items.find((i) => i.key === k));
    check('Launch readiness shows the four production manual items (migration 45)',
      page.status === 200 && prod.every((i) => i && i.kind === 'manual' && i.section === 4), prod.map((i) => i?.key));
    check('…in order after the other section 4 items', (() => {
      const s4 = items.filter((i) => i.section === 4).map((i) => i.ref);
      return s4.indexOf('4.10') > s4.lastIndexOf('4.9') && s4.indexOf('4.13') === s4.length - 1;
    })(), items.filter((i) => i.section === 4).map((i) => i.ref));
  } finally {
    await cleanup();
  }
  console.log(state.failures ? `\n${state.failures} check(s) FAILED` : '\nAll Sprint 50 checks passed');
}

main()
  .catch((e) => { state.failures++; console.error(e); })
  .finally(async () => { await db.end().catch(() => {}); redis.disconnect(); process.exit(state.failures ? 1 : 0); });
