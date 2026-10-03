// src/db/appLogin.ts — the API's own database login (Sprint 41; RUNBOOK §6; C-34, C-46).
//
// Migrations run as the database owner (POSTGRES_USER). The API connects as a separate
// LOGIN role that is a member of `dawabag_app` only (migration 33): it can read and
// write rows, but it cannot switch triggers off, alter tables, take the
// `dawabag_maintenance` role or create objects — so record finality (H1 register,
// audit chain, frozen prescriptions, dispense ledger, GDP records) holds even against
// the API itself.
//
// ensureAppLogin() is run by the owner right after the migrations (db/migrate.ts, when
// DB_APP_LOGIN and DB_APP_PASSWORD are set) and is idempotent: it creates the login or
// brings an existing one back to exactly these attributes, sets its password, gives it
// dawabag_app and takes away any other role membership. The password is sent as a
// SCRAM-SHA-256 verifier computed here, so the plain password never reaches the
// database server or its logs.
import crypto from 'crypto';

type Q = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };

/** Roles the API login must never be, nor be a member of. */
const RESERVED = new Set(['postgres', 'dawabag_app', 'dawabag_maintenance', 'public']);

export const APP_ROLE = 'dawabag_app';

/** Why this login name cannot be used, or null. */
export function loginNameProblem(name: string, owner?: string): string | null {
  if (!/^[a-z_][a-z0-9_]{2,62}$/.test(name)) return 'DB_APP_LOGIN must be 3–63 lower-case letters, digits or _';
  if (RESERVED.has(name) || name.startsWith('pg_')) return `DB_APP_LOGIN cannot be ${name}`;
  if (owner && name === owner) return 'DB_APP_LOGIN must differ from the database owner (DB_USER of the migration)';
  return null;
}

/** Why this password cannot be used, or null. Printable ASCII only (no SASLprep surprises). */
export function loginPasswordProblem(password: string | undefined): string | null {
  if (!password) return 'DB_APP_PASSWORD is not set';
  if (password.length < 16) return 'DB_APP_PASSWORD must be at least 16 characters';
  if (!/^[\x21-\x7e]+$/.test(password)) return 'DB_APP_PASSWORD may contain only printable ASCII characters, no spaces';
  if (/change[-_ ]?(this|me)|example|placeholder/i.test(password)) return 'DB_APP_PASSWORD still has the example value';
  return null;
}

/**
 * PostgreSQL's stored form of a SCRAM-SHA-256 password (RFC 5802 / 7677), as
 * `CREATE ROLE … PASSWORD 'SCRAM-SHA-256$…'` accepts it.
 */
export function scramVerifier(password: string, salt: Buffer = crypto.randomBytes(16), iterations = 4096): string {
  const salted = crypto.pbkdf2Sync(Buffer.from(password, 'utf8'), salt, iterations, 32, 'sha256');
  const hmac = (key: Buffer, text: string) => crypto.createHmac('sha256', key).update(text).digest();
  const storedKey = crypto.createHash('sha256').update(hmac(salted, 'Client Key')).digest();
  const serverKey = hmac(salted, 'Server Key');
  return `SCRAM-SHA-256$${iterations}:${salt.toString('base64')}$${storedKey.toString('base64')}:${serverKey.toString('base64')}`;
}

const ident = (s: string) => `"${s.replace(/"/g, '""')}"`;
const literal = (s: string) => `'${s.replace(/'/g, "''")}'`;

export interface AppLoginResult { login: string; created: boolean; revoked: string[] }

/**
 * Creates or corrects the API login (run as the database owner, after migrations).
 * Also re-applies dawabag_app's privileges, so a database restored without
 * privileges (pg_restore --no-privileges, deploy/staging/restore.sh) works again.
 */
export async function ensureAppLogin(c: Q, login: string, password: string): Promise<AppLoginResult> {
  const me = (await c.query('SELECT current_user AS u')).rows[0].u as string;
  const nameProblem = loginNameProblem(login, me);
  if (nameProblem) throw new Error(nameProblem);
  const pwProblem = loginPasswordProblem(password);
  if (pwProblem) throw new Error(pwProblem);
  // The two NOLOGIN roles of migration 33. Normally there already; a database restored into a
  // fresh PostgreSQL server (pg_restore --no-owner --no-privileges) has its migrations recorded
  // as applied but not the cluster-wide roles, so they are made here too.
  for (const r of [APP_ROLE, 'dawabag_maintenance']) {
    if (!(await c.query(`SELECT 1 FROM pg_roles WHERE rolname = $1`, [r])).rows.length) await c.query(`CREATE ROLE ${ident(r)} NOLOGIN`);
  }
  const attrs = 'LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT CONNECTION LIMIT -1';
  const pw = `PASSWORD ${literal(scramVerifier(password))}`;
  const existing = (await c.query(`SELECT rolsuper FROM pg_roles WHERE rolname = $1`, [login])).rows[0];
  if (existing) await c.query(`ALTER ROLE ${ident(login)} WITH ${attrs} ${pw}`);
  else await c.query(`CREATE ROLE ${ident(login)} WITH ${attrs} ${pw}`);
  // Exactly one membership: dawabag_app (never dawabag_maintenance or the owner)
  const others = (await c.query(
    `SELECT r.rolname FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.roleid JOIN pg_roles u ON u.oid = m.member
     WHERE u.rolname = $1 AND r.rolname <> $2`, [login, APP_ROLE])).rows.map((r) => r.rolname as string);
  for (const r of others) await c.query(`REVOKE ${ident(r)} FROM ${ident(login)}`);
  await c.query(`GRANT ${ident(APP_ROLE)} TO ${ident(login)}`);
  // Nobody but the owner creates objects in the schema (PostgreSQL 15+ default; made explicit)
  await c.query(`REVOKE CREATE ON SCHEMA public FROM PUBLIC`).catch((e: any) => {
    if (e?.code !== '42501') throw e;   // not the schema's owner: PostgreSQL 15+ already denies it
  });
  await c.query(`GRANT CONNECT ON DATABASE ${ident((await c.query('SELECT current_database() AS d')).rows[0].d)} TO ${ident(login)}`);
  // Same privileges as migration 33 §7 (idempotent; repairs a restore made without privileges)
  await c.query(`GRANT USAGE ON SCHEMA public TO dawabag_app, dawabag_maintenance`);
  await c.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO dawabag_app, dawabag_maintenance`);
  await c.query(`GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO dawabag_app, dawabag_maintenance`);
  await c.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO dawabag_app, dawabag_maintenance`);
  await c.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO dawabag_app, dawabag_maintenance`);
  // The retention purge acts as dawabag_maintenance only while that role owns it (lost by a restore with --no-owner)
  if ((await c.query(`SELECT 1 FROM pg_proc WHERE proname = 'dawabag_purge_prescriptions'`)).rows.length) {
    await c.query(`ALTER FUNCTION dawabag_purge_prescriptions(integer) OWNER TO dawabag_maintenance`);
    await c.query(`REVOKE ALL ON FUNCTION dawabag_purge_prescriptions(integer) FROM PUBLIC`);
    await c.query(`GRANT EXECUTE ON FUNCTION dawabag_purge_prescriptions(integer) TO dawabag_app`);
  }
  // The login must own nothing (an owner could disable triggers on its tables)
  const owned = (await c.query(
    `SELECT count(*)::int AS n FROM pg_class cl JOIN pg_roles r ON r.oid = cl.relowner
     JOIN pg_namespace n ON n.oid = cl.relnamespace WHERE r.rolname = $1 AND n.nspname = 'public'`, [login])).rows[0].n;
  if (owned > 0) throw new Error(`${login} owns ${owned} table(s) or other relations; reassign them to the owner (REASSIGN OWNED BY ${login} TO ${me})`);
  return { login, created: !existing, revoked: others };
}

export interface LoginPosture {
  user: string;
  superuser: boolean;
  owns_tables: boolean;
  maintenance_member: boolean;
  app_member: boolean;
  restricted: boolean;
}

/** What the API's own connection may do (start-up check and the admin dashboard warning). */
export async function loginPosture(c: Q): Promise<LoginPosture> {
  const r = (await c.query(
    `SELECT current_user AS user, r.rolsuper AS superuser,
            EXISTS (SELECT 1 FROM pg_class cl JOIN pg_namespace n ON n.oid = cl.relnamespace
                    WHERE cl.relowner = r.oid AND n.nspname = 'public' AND cl.relkind = 'r') AS owns_tables,
            (SELECT pg_has_role(current_user, 'dawabag_maintenance', 'MEMBER') FROM pg_roles WHERE rolname = 'dawabag_maintenance') AS maintenance_member,
            (SELECT pg_has_role(current_user, 'dawabag_app', 'MEMBER') FROM pg_roles WHERE rolname = 'dawabag_app') AS app_member
     FROM pg_roles r WHERE r.rolname = current_user`)).rows[0];
  const p = { user: r.user, superuser: !!r.superuser, owns_tables: !!r.owns_tables, maintenance_member: !!r.maintenance_member, app_member: !!r.app_member };
  return { ...p, restricted: !p.superuser && !p.owns_tables && !p.maintenance_member && p.app_member };
}
