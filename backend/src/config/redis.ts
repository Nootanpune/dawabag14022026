import Redis from 'ioredis';
import { logger } from './logger';

let redis: Redis;

export function connectRedis(): Promise<void> {
  return new Promise((resolve, reject) => {
    redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      // Keep reconnecting after a Redis restart instead of giving up for good
      retryStrategy: (times) => Math.min(times * 200, 5000),
    });

    let started = false;
    redis.on('ready', () => { started = true; resolve(); });
    redis.on('error', (err) => {
      logger.error('Redis error:', err);
      if (!started) reject(err);   // only the first connection is fatal
    });
  });
}

export function getRedis(): Redis {
  if (!redis) throw new Error('Redis not connected. Call connectRedis() first.');
  return redis;
}

// ─── Helper: Cache with TTL ─────────────────────────────────────────────────
export async function cacheGet<T>(key: string): Promise<T | null> {
  const data = await redis.get(key);
  return data ? JSON.parse(data) : null;
}

export async function cacheSet(
  key: string,
  value: any,
  ttlSeconds = 300
): Promise<void> {
  await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
}

export async function cacheDel(key: string): Promise<void> {
  await redis.del(key);
}

// ─── OTP Store ──────────────────────────────────────────────────────────────
// One-time codes: services/otp/otp.service.ts (send limits, wrong-code counter; Sprint 41).

// ─── Session / Refresh Token Blacklist ─────────────────────────────────────
export async function blacklistToken(jti: string, ttl: number): Promise<void> {
  await redis.set(`blacklist:${jti}`, '1', 'EX', ttl);
}

export async function isTokenBlacklisted(jti: string): Promise<boolean> {
  const val = await redis.get(`blacklist:${jti}`);
  return val === '1';
}
