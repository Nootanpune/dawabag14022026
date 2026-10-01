// Push through Firebase Cloud Messaging HTTP v1 (the legacy server-key API was
// shut down in 2024). Auth: a service account (FCM_SERVICE_ACCOUNT_JSON, the JSON
// or its base64) signs a JWT that is exchanged for a 1-hour OAuth token, cached
// in memory only. Tokens Firebase reports as unregistered are removed.
import crypto from 'crypto';
import { query } from '../../../config/database';
import { ChannelResult } from './result';

interface ServiceAccount { project_id: string; client_email: string; private_key: string; token_uri?: string }
let cached: { token: string; exp: number } | null = null;

function account(): ServiceAccount | null {
  const raw = process.env.FCM_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try { return JSON.parse(raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8')); } catch { return null; }
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

async function accessToken(sa: ServiceAccount): Promise<string> {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const tokenUri = process.env.GOOGLE_OAUTH_TOKEN_URL || sa.token_uri || 'https://oauth2.googleapis.com/token';
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: tokenUri, iat: now, exp: now + 3600 }));
  const sig = b64url(crypto.createSign('RSA-SHA256').update(`${head}.${claims}`).sign(sa.private_key));
  const res = await fetch(tokenUri, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claims}.${sig}` }),
  });
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) throw new Error(`Google token exchange failed: ${body.error_description || body.error || res.status}`);
  cached = { token: body.access_token, exp: Date.now() + Number(body.expires_in || 3600) * 1000 };
  return cached.token;
}

export async function sendPushTo(tokens: string[], title: string, body: string, data: Record<string, unknown>): Promise<ChannelResult[]> {
  const sa = account();
  if (!sa) return [{ status: 'skipped', detail: 'Push (FCM) not configured' }];
  if (!tokens.length) return [{ status: 'skipped', detail: 'No registered device' }];
  let auth: string;
  try { auth = await accessToken(sa); } catch (e: any) { return [{ status: 'failed', detail: e.message }]; }
  // FCM data values must be strings; only ids and the type are sent (no personal data)
  const safe = Object.fromEntries(Object.entries({ type: data.type, order_id: data.orderId }).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]));
  const base = process.env.FCM_BASE_URL || 'https://fcm.googleapis.com';
  const out: ChannelResult[] = [];
  for (const token of tokens) {
    try {
      const res = await fetch(`${base}/v1/projects/${sa.project_id}/messages:send`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
        body: JSON.stringify({ message: { token, notification: { title, body }, data: safe } }),
      });
      const b: any = await res.json().catch(() => ({}));
      if (res.ok) { out.push({ status: 'sent', ref: b.name }); continue; }
      const code = b?.error?.details?.find?.((d: any) => d.errorCode)?.errorCode || b?.error?.status;
      if (res.status === 404 || code === 'UNREGISTERED') await query('DELETE FROM user_devices WHERE fcm_token = $1', [token]);
      out.push({ status: 'failed', detail: `${res.status} ${code ?? ''}`.trim() });
    } catch (e: any) {
      out.push({ status: 'failed', detail: String(e?.message || e).slice(0, 300) });
    }
  }
  return out;
}

export function resetPushAuthCache() { cached = null; }
