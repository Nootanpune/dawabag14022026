// Encryption at rest of health details (Sprint 43; DPDP sensitive personal data, C-41, C-44).
//
// What is sealed: a buyer's allergies, conditions and current medicines (health_profiles.sealed)
// and a family member's allergies and conditions (patients.health_sealed) — one JSON object per
// row, AES-256-GCM, the row's table and id bound in as associated data (a sealed value copied
// to another person's row does not open). The plain JSONB columns stay empty ('[]'): a database
// check refuses plain values next to a sealed one. Nothing on these fields is ever searched.
//
// Key: HEALTH_ENC_KEY from the server's environment (32+ random characters; never in the
// database or the repository). A sub-key is derived with HKDF-SHA-256. Each sealed value names
// the key it was sealed with (first 8 hex of SHA-256 of the sub-key), so the key can be rotated:
// the new key in HEALTH_ENC_KEY, the old one(s) in HEALTH_ENC_KEY_PREVIOUS (comma-separated);
// at start-up the API re-seals every row under the current key (RUNBOOK §6 "Health data key").
// Without HEALTH_ENC_KEY: APP_ENV=production refuses to start (config/env.ts); the trial server
// derives a stable one (deploy/trial/trial.sh); a development / CI machine (NODE_ENV not
// production) uses a fixed development key; any other server derives it from JWT_REFRESH_SECRET
// and warns.
import crypto from 'crypto';
import { AppError } from '../../utils/AppError';

export type HealthKeySource = 'env' | 'derived' | 'development';

const PREFIX = 'h1';

function material(raw: string): Buffer {
  return Buffer.from(crypto.hkdfSync('sha256', Buffer.from(raw, 'utf8'), Buffer.from('dawabag-health'), Buffer.from('health-profile-v1'), 32));
}
const keyId = (k: Buffer) => crypto.createHash('sha256').update(k).digest('hex').slice(0, 8);

/** The key to seal with, where it came from, and every key that may open an older value. */
export function healthKeys(env: NodeJS.ProcessEnv = process.env): { current: { id: string; key: Buffer }; all: Map<string, Buffer>; source: HealthKeySource } {
  const configured = String(env.HEALTH_ENC_KEY ?? '').trim();
  let raw: string;
  let source: HealthKeySource;
  if (configured) { raw = configured; source = 'env'; }
  else if (env.NODE_ENV !== 'production') { raw = 'dawabag-development-health-key (development and CI only)'; source = 'development'; }
  else {
    const fallback = String(env.JWT_REFRESH_SECRET ?? '');
    if (!fallback) throw new Error('HEALTH_ENC_KEY is not set and there is no JWT_REFRESH_SECRET to derive it from');
    raw = `dawabag-health-fallback:${fallback}`; source = 'derived';
  }
  const key = material(raw);
  const current = { id: keyId(key), key };
  const all = new Map<string, Buffer>([[current.id, key]]);
  for (const old of String(env.HEALTH_ENC_KEY_PREVIOUS ?? '').split(',').map((s) => s.trim()).filter(Boolean)) {
    const k = material(old);
    all.set(keyId(k), k);
  }
  return { current, all, source };
}

/** Associated data: which row the value belongs to. */
export const healthAad = (table: 'health_profiles' | 'patients', id: string) => `${table}:${id}`;

/** "h1.<key id>.<base64url(iv | tag | ciphertext)>" */
export function sealHealth(aad: string, value: unknown, env?: NodeJS.ProcessEnv): string {
  const { current } = healthKeys(env);
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', current.key, iv);
  c.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([c.update(Buffer.from(JSON.stringify(value), 'utf8')), c.final()]);
  return `${PREFIX}.${current.id}.${Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64url')}`;
}

/** A sealed value this server cannot open: a plain message for people, details in the server log. */
export class HealthUnreadable extends AppError {
  constructor(public detail: string) {
    super('Health details could not be read on this server. Please tell the Dawabag team (health data key).', 500, true, 'HEALTH_DATA_UNREADABLE');
  }
}

/** The sealed value, or throws HealthUnreadable (unknown key, another row's value, changed bytes). */
export function openHealth<T = unknown>(aad: string, blob: string, env?: NodeJS.ProcessEnv): T {
  const [p, id, body] = String(blob).split('.');
  if (p !== PREFIX || !id || !body) throw new HealthUnreadable('Unknown sealed health format');
  const key = healthKeys(env).all.get(id);
  if (!key) throw new HealthUnreadable(`Health data sealed with key ${id}, which this server does not have (HEALTH_ENC_KEY / HEALTH_ENC_KEY_PREVIOUS)`);
  try {
    const raw = Buffer.from(body, 'base64url');
    const d = crypto.createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
    d.setAAD(Buffer.from(aad));
    d.setAuthTag(raw.subarray(12, 28));
    return JSON.parse(Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8')) as T;
  } catch {
    throw new HealthUnreadable('Health data could not be opened (wrong key or changed value)');
  }
}

/** True when the value was sealed with an older key (re-sealed at start-up). */
export function sealedWithOldKey(blob: string | null | undefined, env?: NodeJS.ProcessEnv): boolean {
  if (!blob) return false;
  return String(blob).split('.')[1] !== healthKeys(env).current.id;
}

// ── Row shapes ───────────────────────────────────────────────────────────────
export interface ProfileHealth { allergies: string[]; conditions: string[]; current_medicines: string[] }
export interface MemberHealth { allergies: string[]; conditions: string[] }

const list = (x: unknown): string[] => (Array.isArray(x) ? x.filter((s) => typeof s === 'string') : []);

/** A health_profiles row → its health details (sealed value, else the legacy plain columns). */
export function profileHealth(row: { user_id: string; sealed?: string | null; allergies?: unknown; conditions?: unknown; current_medicines?: unknown } | null | undefined): ProfileHealth {
  if (!row) return { allergies: [], conditions: [], current_medicines: [] };
  const src: any = row.sealed ? openHealth(healthAad('health_profiles', row.user_id), row.sealed) : row;
  return { allergies: list(src.allergies), conditions: list(src.conditions), current_medicines: list(src.current_medicines) };
}

/** A patients row → the member's health details. */
export function memberHealth(row: { id: string; health_sealed?: string | null; allergies?: unknown; conditions?: unknown }): MemberHealth {
  const src: any = row.health_sealed ? openHealth(healthAad('patients', row.id), row.health_sealed) : row;
  return { allergies: list(src.allergies), conditions: list(src.conditions) };
}

/** Sealed value for a member, or null when there is nothing to keep. */
export function sealMember(id: string, h: MemberHealth): string | null {
  return h.allergies.length || h.conditions.length ? sealHealth(healthAad('patients', id), h) : null;
}
