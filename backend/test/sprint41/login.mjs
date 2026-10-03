// Sprint 41 — the API runs as its own restricted database login (RUNBOOK §6; C-34, C-46):
// a member of dawabag_app only, made by the migration runner (src/db/appLogin.ts). It reads
// and writes rows but cannot switch the record triggers off, empty a statutory table, take
// the maintenance role or create objects; the scheduled jobs work under it.
import { execFile } from 'child_process';
import { createRequire } from 'module';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { call, check, q } from '../sprint5/lib.mjs';
import { t } from '../sprint39/fixtures.mjs';

const require = createRequire(import.meta.url);
const { Client } = require('pg');
const backend = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const LOGIN = process.env.DB_APP_LOGIN, PASSWORD = process.env.DB_APP_PASSWORD;

const migrate = (env = {}) => new Promise((res) => execFile('npx', ['ts-node', '--transpile-only', 'src/db/migrate.ts'],
  { cwd: backend, env: { ...process.env, MIGRATIONS_DIR: resolve(backend, '../database'), ...env } },
  (err, stdout, stderr) => res({ code: err ? err.code ?? 1 : 0, out: `${stdout}${stderr}` })));

async function asLogin(fn) {
  const url = new URL(process.env.DATABASE_URL);
  const c = new Client({ host: url.hostname, port: Number(url.port || 5432), database: url.pathname.slice(1), user: LOGIN, password: PASSWORD });
  await c.connect();
  try { return await fn(c); } finally { await c.end(); }
}
const refused = async (c, sql) => { try { await c.query(sql); return null; } catch (e) { return e.code || 'error'; } };

export async function runRestrictedLogin() {
  console.log('\nA. The API as its own restricted database login (RUNBOOK §6)');
  check('this run configures the API login (DB_APP_LOGIN / DB_APP_PASSWORD, scripts/dev-env.sh)', !!LOGIN && !!PASSWORD, { LOGIN });
  if (!LOGIN || !PASSWORD) return;
  const [role] = await q(
    `SELECT r.rolsuper, r.rolcreaterole, r.rolcreatedb, r.rolbypassrls, r.rolcanlogin,
            ARRAY(SELECT g.rolname FROM pg_auth_members m JOIN pg_roles g ON g.oid = m.roleid WHERE m.member = r.oid ORDER BY 1)::text[] AS member_of,
            (SELECT COUNT(*)::int FROM pg_class cl WHERE cl.relowner = r.oid) AS owns
     FROM pg_roles r WHERE r.rolname = $1`, [LOGIN]);
  check(`${LOGIN} is a login, not a superuser, cannot create roles or databases, owns nothing`, role && role.rolcanlogin && !role.rolsuper
    && !role.rolcreaterole && !role.rolcreatedb && !role.rolbypassrls && role.owns === 0, role);
  check('… and is a member of dawabag_app only', JSON.stringify(role?.member_of) === JSON.stringify(['dawabag_app']), role?.member_of);

  let r = await call('GET', '/admin/config-warnings', { token: t.opsAdmin });
  check('the running API reports no DB_LOGIN_NOT_RESTRICTED warning (it is connected as the restricted login)', r.status === 200
    && !r.json.data.warnings.some((w) => w.code === 'DB_LOGIN_NOT_RESTRICTED'), r.json.data);

  await asLogin(async (c) => {
    check('the login reads and writes ordinary rows', (await refused(c, 'SELECT id FROM orders LIMIT 1')) === null
      && (await refused(c, `UPDATE app_settings SET updated_at = updated_at WHERE key = 'sales.rx_pause'`)) === null);
    check('… cannot take the maintenance role (SET ROLE dawabag_maintenance → 42501)', (await refused(c, 'SET ROLE dawabag_maintenance')) === '42501');
    check('… cannot switch the audit-log triggers off (ALTER TABLE → must be owner)', (await refused(c, 'ALTER TABLE audit_logs DISABLE TRIGGER ALL')) === '42501');
    check('… cannot empty a statutory table (TRUNCATE h1_register / chain_heads → 42501)', (await refused(c, 'TRUNCATE h1_register')) === '42501'
      && (await refused(c, 'TRUNCATE chain_heads')) === '42501');
    await c.query(`SELECT set_config('dawabag.maintenance', 'on', false)`);
    const del = await refused(c, `DELETE FROM audit_logs WHERE id = (SELECT id FROM audit_logs ORDER BY created_at LIMIT 1)`);
    check('… and with the maintenance switch set by hand, deleting an audit entry is still refused by its trigger', del !== null, del);
    check('… cannot create objects (CREATE TABLE / FUNCTION in public → 42501)', (await refused(c, 'CREATE TABLE s41_probe (x int)')) === '42501'
      && (await refused(c, `CREATE FUNCTION s41_probe() RETURNS int LANGUAGE sql AS 'SELECT 1'`)) === '42501');
    check('… may call the controlled retention purge (SECURITY DEFINER, owned by dawabag_maintenance)',
      (await refused(c, 'SELECT * FROM dawabag_purge_prescriptions(0)')) === null);
  });

  // The jobs (Bull queues and the scheduler) run in the API process, on the same login
  for (const job of ['retention_purge', 'payment_hold_watch', 'chain_verify', 'live_stock_feed_watch', 'self_inspection_watch', 'pharmacist_registration_alerts']) {
    r = await call('POST', `/admin/jobs/${job}/run`, { token: t.admin });
    check(`job ${job} runs as the restricted login`, r.status === 200 && r.json.data?.status === 'succeeded', r.json);
  }

  // The runner repairs the login: an extra membership is taken away, the password set again
  // (as the owner: the suite's session otherwise acts as dawabag_maintenance)
  await q('RESET ROLE'); await q(`GRANT dawabag_maintenance TO ${LOGIN}`); await q('SET ROLE dawabag_maintenance');
  const m = await migrate();
  const [after] = await q(`SELECT ARRAY(SELECT g.rolname FROM pg_auth_members m JOIN pg_roles g ON g.oid = m.roleid
                             JOIN pg_roles u ON u.oid = m.member WHERE u.rolname = $1 ORDER BY 1)::text[] AS member_of`, [LOGIN]);
  check('re-running the migrations corrects the login: the extra dawabag_maintenance membership is removed', m.code === 0
    && /API login .* checked/.test(m.out) && /removed from dawabag_maintenance/.test(m.out)
    && JSON.stringify(after.member_of) === JSON.stringify(['dawabag_app']), { out: m.out.slice(-400), after });
  check('… and the login still connects with its password', await asLogin(async (c) => (await c.query('SELECT 1 AS ok')).rows[0].ok === 1));
  const bad = await migrate({ DB_APP_LOGIN: 'dawabag_maintenance' });
  check('the runner refuses to turn a reserved role into the API login', bad.code !== 0 && /DB_APP_LOGIN cannot be dawabag_maintenance/.test(bad.out), bad.out.slice(-300));
  const weak = await migrate({ DB_APP_PASSWORD: 'short' });
  check('… and a weak API password', weak.code !== 0 && /at least 16 characters/.test(weak.out), weak.out.slice(-300));
}
