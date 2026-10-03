// Sprint 40 — nightly chain check with recorded heads (C-09, C-46): the job records each
// chain's head (number + hash) in an append-only table, and alerts admins when an entry is
// changed or the newest entries are cut off (test-only superuser path, then restored).
import { call, check, q } from '../sprint5/lib.mjs';
import { ids, plainClient, t, waitFor } from './fixtures.mjs';

const latest = async (chain) => (await q(`SELECT last_no::int AS last_no, head_hash, ok, problem FROM chain_heads WHERE chain = $1 ORDER BY recorded_at DESC LIMIT 1`, [chain]))[0];
const breakAlerts = async () => (await q(`SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND type = 'chain_break'`, [ids.opsAdmin]))[0].n;

export async function runIntegrity() {
  console.log('\nI. Nightly chain check with recorded heads (C-09, C-46)');
  // Test database: earlier suites' clean-ups removed their own rows, so the check starts at this point
  const start = { audit: (await q(`SELECT MAX(chain_seq)::int + 1 AS n FROM audit_logs WHERE row_hash IS NOT NULL`))[0].n };
  for (const k of await q(`SELECT register_key, MAX(entry_no)::int + 1 AS n FROM h1_register WHERE entry_no IS NOT NULL GROUP BY register_key`)) start[`h1:${k.register_key}`] = k.n;
  await q(`INSERT INTO app_settings (key, value, description) VALUES ('integrity.chain_start', $1, 'S40 test start point') ON CONFLICT (key) DO UPDATE SET value = $1`, [JSON.stringify(start)]);
  // a few sealed entries after the start point
  for (let i = 0; i < 3; i++) await call('GET', `/admin/audit-chain/verify?from=${start.audit}`, { token: t.opsAdmin });

  let r = await call('POST', '/admin/jobs/chain_verify/run', { token: t.admin });
  check('the nightly chain_verify job runs and finds every chain whole', r.status === 200 && r.json.data?.status === 'succeeded' && r.json.data.summary?.ok === true, r.json.data);
  const h1 = await latest('audit');
  check('… and records the audit chain\'s head (number + hash)', h1?.ok === true && h1.last_no >= start.audit && /^[0-9a-f]{64}$/.test(h1.head_hash), h1);
  const plain = await plainClient();
  check('recorded heads are append-only', /append-only/.test(await plain.query(`DELETE FROM chain_heads`).then(() => '', (e) => e.message)));
  r = await call('GET', '/admin/chain-heads', { token: t.opsAdmin });
  check('admins see the latest heads and the last run', r.status === 200 && r.json.data.heads.some((x) => x.chain === 'audit') && r.json.data.last_job_run?.status === 'succeeded', r.json.data);
  r = await call('GET', '/admin/chain-heads', { token: t.pharmacist });
  check('… pharmacists do not', r.status === 403);

  // Tamper (test-only superuser path: triggers off for this session)
  const alertsBefore = await breakAlerts();
  await plain.query(`SET session_replication_role = replica`);
  const victim = (await plain.query(`SELECT id, notes FROM audit_logs WHERE chain_seq = $1`, [h1.last_no])).rows[0];
  await plain.query(`UPDATE audit_logs SET notes = 'S40 tampered' WHERE id = $1`, [victim.id]);
  r = await call('POST', '/admin/chain-heads/verify', { token: t.opsAdmin });
  check('an edited entry is reported as a break', r.status === 200 && r.json.data.ok === false
    && r.json.data.results.some((x) => x.chain === 'audit' && !x.ok), r.json.data?.results?.filter((x) => !x.ok));
  check('… and every admin is alerted at once', !!(await waitFor(async () => (await breakAlerts()) > alertsBefore)));
  await plain.query(`UPDATE audit_logs SET notes = $2 WHERE id = $1`, [victim.id, victim.notes]);
  r = await call('POST', '/admin/chain-heads/verify', { token: t.opsAdmin });
  check('restored, the chain is whole again', r.json.data?.ok === true, r.json.data?.results?.filter((x) => !x.ok));

  // Truncation: the newest entries removed — a plain walk cannot see it; the recorded head can.
  // New audit entries wait (seal lock held) so nothing takes the removed numbers meanwhile.
  await plain.query(`SELECT pg_advisory_lock(72000038, 0)`);
  try {
    const head = (await latest('audit')).last_no;
    const cut = (await plain.query(`SELECT * FROM audit_logs WHERE chain_seq >= $1 ORDER BY chain_seq`, [head])).rows;
    await plain.query(`DELETE FROM audit_logs WHERE chain_seq >= $1`, [head]);
    const pending = call('POST', '/admin/chain-heads/verify', { token: t.opsAdmin });   // its own audit entry waits for the lock
    let found;
    for (let i = 0; i < 60 && !found; i++) {
      found = (await q(`SELECT problem FROM chain_heads WHERE chain = 'audit' AND NOT ok AND problem LIKE '%cut short%' AND recorded_at > NOW() - INTERVAL '1 minute'`))[0];
      if (!found) await new Promise((res) => setTimeout(res, 250));
    }
    check('newest entries removed: reported as the chain cut short', !!found, found);
    await plain.query(`INSERT INTO audit_logs SELECT * FROM json_populate_recordset(NULL::audit_logs, $1)`, [JSON.stringify(cut)]);
    await plain.query(`SELECT pg_advisory_unlock(72000038, 0)`);
    r = await pending;
    check('… the run reports it', r.json.data?.ok === false, r.json.data?.results?.filter((x) => !x.ok));
  } finally {
    await plain.query(`SELECT pg_advisory_unlock_all()`);
  }
  r = await call('POST', '/admin/chain-heads/verify', { token: t.opsAdmin });
  check('restored, whole again', r.json.data?.ok === true, r.json.data?.results?.filter((x) => !x.ok));
  await plain.end();
}
