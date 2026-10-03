// src/db/migrate.ts — applies database/NN_*.sql in order, once each.
//   npm run db:migrate                  apply pending migrations
//   npm run db:migrate -- --status      list applied / pending
//   npm run db:migrate -- --baseline 08 record 01..08 as applied without running
//                                       them (a database built before this runner)
// Each file runs in its own transaction under an advisory lock, and its
// checksum is stored: an applied file that later changes is reported, never re-run.
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Client } from 'pg';
import dotenv from 'dotenv';
import { ensureAppLogin } from './appLogin';

dotenv.config();

const LOCK_KEY = 72_000_001;

function migrationsDir(): string {
  const candidates = [process.env.MIGRATIONS_DIR, path.resolve(__dirname, '../../database'), path.resolve(__dirname, '../../../database')];
  const dir = candidates.find((d) => d && fs.existsSync(d) && fs.readdirSync(d).some((f) => /^\d+_.*\.sql$/.test(f)));
  if (!dir) throw new Error('Migrations folder not found; set MIGRATIONS_DIR');
  return dir;
}

export function listMigrations(dir: string) {
  return fs.readdirSync(dir).filter((f) => /^\d+_.*\.sql$/.test(f)).sort()
    .map((file) => {
      const sql = fs.readFileSync(path.join(dir, file), 'utf8');
      return { file, sql, checksum: crypto.createHash('sha256').update(sql).digest('hex') };
    });
}

export async function migrate(args: string[] = process.argv.slice(2)) {
  const client = new Client(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {
    host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || 'dawabag', user: process.env.DB_USER || 'dawabag_user',
    password: process.env.DB_PASSWORD, ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      file VARCHAR(200) PRIMARY KEY, checksum CHAR(64) NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      baselined BOOLEAN NOT NULL DEFAULT FALSE)`);
    const applied = new Map((await client.query('SELECT file, checksum FROM schema_migrations')).rows.map((r) => [r.file, r.checksum]));
    const all = listMigrations(migrationsDir());

    const bi = args.indexOf('--baseline');
    if (bi >= 0) {
      const upto = args[bi + 1];
      if (!upto || !/^\d+$/.test(upto)) throw new Error('Usage: --baseline <number>, e.g. --baseline 08');
      for (const m of all.filter((x) => Number(x.file.split('_')[0]) <= Number(upto) && !applied.has(x.file))) {
        await client.query('INSERT INTO schema_migrations (file, checksum, baselined) VALUES ($1, $2, TRUE)', [m.file, m.checksum]);
        console.log(`baselined ${m.file}`);
      }
      return;
    }

    for (const m of all) {
      if (applied.has(m.file) && applied.get(m.file) !== m.checksum) console.warn(`WARNING: ${m.file} changed after it was applied (not re-run)`);
    }
    const pending = all.filter((m) => !applied.has(m.file));
    if (args.includes('--status')) {
      for (const m of all) console.log(`${applied.has(m.file) ? 'applied ' : 'PENDING '} ${m.file}`);
      return;
    }
    for (const m of pending) {
      process.stdout.write(`applying ${m.file} … `);
      await client.query('BEGIN');
      try {
        await client.query(m.sql);
        await client.query('INSERT INTO schema_migrations (file, checksum) VALUES ($1, $2)', [m.file, m.checksum]);
        await client.query('COMMIT');
        console.log('done');
      } catch (e) {
        await client.query('ROLLBACK');
        console.log('FAILED');
        throw e;
      }
    }
    if (!pending.length) console.log('Database is up to date');
    // Sprint 41: the API's own restricted login (member of dawabag_app only), created or
    // corrected by the owner here, before the API starts (RUNBOOK §6; C-34, C-46)
    if (process.env.DB_APP_LOGIN) {
      const r = await ensureAppLogin(client, process.env.DB_APP_LOGIN, process.env.DB_APP_PASSWORD ?? '');
      console.log(`API login ${r.login} ${r.created ? 'created' : 'checked'} (member of dawabag_app only${r.revoked.length ? `; removed from ${r.revoked.join(', ')}` : ''})`);
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => undefined);
    await client.end();
  }
}

if (require.main === module) {
  migrate().catch((e) => { console.error(e.message || e); process.exit(1); });
}
