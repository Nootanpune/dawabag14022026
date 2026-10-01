import { Pool, PoolClient } from 'pg';
import { logger } from './logger';

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
      // Business days are Indian days: CURRENT_DATE, ::date and date_trunc in IST
      options: '-c timezone=Asia/Kolkata',
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
