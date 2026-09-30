import Redis from 'ioredis';
import { logger } from './logger';

let redis: Redis;

export function connectRedis(): Promise<void> {
  return new Promise((resolve, reject) => {
    redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      retryStrategy: (times) => {
        if (times > 3) return null;
        return Math.min(times * 200, 2000);
      },
    });

    redis.on('ready', () => resolve());
    redis.on('error', (err) => {
      logger.error('Redis error:', err);
      reject(err);
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
export async function storeOTP(mobile: string, otp: string): Promise<void> {
  const key = `otp:${mobile}`;
  const expiry = parseInt(process.env.OTP_EXPIRY_MINUTES || '10') * 60;
  await redis.set(key, otp, 'EX', expiry);
}

export async function verifyOTP(mobile: string, otp: string): Promise<boolean> {
  const key = `otp:${mobile}`;
  const stored = await redis.get(key);
  if (!stored || stored !== otp) return false;
  await redis.del(key);
  return true;
}

// ─── Session / Refresh Token Blacklist ─────────────────────────────────────
export async function blacklistToken(jti: string, ttl: number): Promise<void> {
  await redis.set(`blacklist:${jti}`, '1', 'EX', ttl);
}

export async function isTokenBlacklisted(jti: string): Promise<boolean> {
  const val = await redis.get(`blacklist:${jti}`);
  return val === '1';
}
