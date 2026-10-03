import { Pool, PoolClient } from 'pg';
import { logger } from './logger';

/** Trigram word-similarity threshold for product search (Sprint 23). */
export const SEARCH_WORD_SIMILARITY = 0.5;

// Exported as a live binding: modules that import { pool } see it once connectDB() has run.
export let pool: Pool;

export function connectDB(): Promise<void> {
  return new Promise((resolve, reject) => {
    pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'dawabag',
      user: process.env.DB_USER || 'dawabag_user',
      password: process.env.DB_PASSWORD,
      max: parseInt(process.env.DB_POOL_MAX || '20'),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
      // Business days are Indian days: CURRENT_DATE, ::date and date_trunc in IST.
      // Product search: how close a typed word must be to a catalogue word for the
      // pg_trgm `<%` match (default 0.6 misses "amoxycillin" → Amoxicillin). Harmless
      // when the extension is not installed (services/search/trigramSupport.ts).
      options: `-c timezone=Asia/Kolkata -c pg_trgm.word_similarity_threshold=${SEARCH_WORD_SIMILARITY}`,
    });

    pool.connect((err, client, done) => {
      if (err) {
        reject(err);
        return;
      }
      done();
      resolve();
    });

    pool.on('error', (err) => {
      logger.error('Unexpected PostgreSQL pool error:', err);
    });
  });
}

export function getDB(): Pool {
  if (!pool) throw new Error('Database not connected. Call connectDB() first.');
  return pool;
}

export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

const RETRYABLE = new Set(['40P01', '40001']);   // deadlock detected, serialisation failure

/**
 * A transaction that is run again (up to `attempts` times, after a short random pause)
 * when PostgreSQL aborts it as a deadlock victim or for a serialisation conflict
 * (Sprint 38: checkout vs. a partner's live stock snapshot). Only for callbacks whose
 * effects are all inside the transaction.
 */
export async function withTransactionRetry<T>(callback: (client: PoolClient) => Promise<T>, attempts = 3): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await withTransaction(callback);
    } catch (e) {
      if (!RETRYABLE.has((e as any)?.code) || attempt >= attempts) throw e;
      logger.warn(`Transaction retried after ${(e as any).code} (attempt ${attempt})`);
      await new Promise((r) => setTimeout(r, 20 + Math.floor(Math.random() * 80 * attempt)));
    }
  }
}

export async function query<T = any>(
  text: string,
  params?: any[]
): Promise<T[]> {
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;
  if (duration > 1000) {
    logger.warn(`Slow query (${duration}ms): ${text.substring(0, 100)}`);
  }
  return result.rows as T[];
}

export async function queryOne<T = any>(
  text: string,
  params?: any[]
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}
