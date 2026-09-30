// src/services/settings.service.ts
// Business rules the owner can change (app_settings table) — read from the
// server on use; never hard-coded or cached on clients.
import { PoolClient } from 'pg';
import { query } from '../config/database';

type Queryable = Pick<PoolClient, 'query'>;

export async function getSetting<T>(key: string, fallback: T, db?: Queryable): Promise<T> {
  const sql = 'SELECT value FROM app_settings WHERE key = $1';
  const rows = db ? (await db.query(sql, [key])).rows : await query<{ value: T }>(sql, [key]);
  return rows[0] ? (rows[0].value as T) : fallback;
}

export async function listSettings() {
  return query('SELECT key, value, description, updated_at FROM app_settings ORDER BY key');
}
