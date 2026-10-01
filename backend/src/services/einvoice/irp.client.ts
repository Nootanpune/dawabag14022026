// Invoice Registration Portal (IRP) client — the common e-invoice API published
// by NIC and followed by the other IRPs (IRIS, etc.). Login: credentials and a
// random app key are encrypted with the IRP's public key; the IRP returns a
// session key (SEK) encrypted with the app key. Every request and response body
// is then AES-256-ECB encrypted with the SEK. Token and SEK live in memory only.
// IRP_BASE_URL selects the IRP (sandbox or production); tests use a fake one.
import crypto from 'crypto';

export class IrpError extends Error {
  constructor(public code: string, message: string, public transient = false, public info?: any) { super(message); }
}

let session: { token: string; sek: Buffer; exp: number; gstin: string } | null = null;

export const irpConfigured = () =>
  !!(process.env.IRP_BASE_URL && process.env.IRP_CLIENT_ID && process.env.IRP_CLIENT_SECRET
     && process.env.IRP_USERNAME && process.env.IRP_PASSWORD && process.env.IRP_PUBLIC_KEY);

const publicKey = () => {
  const raw = process.env.IRP_PUBLIC_KEY!.trim();
  const pem = raw.startsWith('-----') ? raw : `-----BEGIN PUBLIC KEY-----\n${raw.match(/.{1,64}/g)!.join('\n')}\n-----END PUBLIC KEY-----`;
  return crypto.createPublicKey(pem.replace(/\\n/g, '\n'));
};

function aes(mode: 'enc' | 'dec', key: Buffer, data: Buffer): Buffer {
  const c = mode === 'enc' ? crypto.createCipheriv('aes-256-ecb', key, null) : crypto.createDecipheriv('aes-256-ecb', key, null);
  return Buffer.concat([c.update(data), c.final()]);
}

const headers = (gstin: string, extra: Record<string, string> = {}) => ({
  'Content-Type': 'application/json', client_id: process.env.IRP_CLIENT_ID!, client_secret: process.env.IRP_CLIENT_SECRET!,
  Gstin: gstin, ...extra,
});

async function post(url: string, h: Record<string, string>, body: unknown): Promise<any> {
  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', headers: h, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
  } catch (e: any) {
    throw new IrpError('NETWORK', `IRP unreachable: ${e?.message || e}`, true);
  }
  const b: any = await res.json().catch(() => ({}));
  if (res.status >= 500 || res.status === 429) throw new IrpError(`HTTP${res.status}`, `IRP is not responding (${res.status})`, true);
  return b;
}

const errorOf = (b: any) => {
  const d = Array.isArray(b?.ErrorDetails) ? b.ErrorDetails[0] : null;
  return { code: String(d?.ErrorCode ?? 'UNKNOWN'), message: String(d?.ErrorMessage ?? b?.message ?? 'IRP refused the request') };
};

async function login(gstin: string) {
  const appKey = crypto.randomBytes(32);
  const plain = JSON.stringify({ UserName: process.env.IRP_USERNAME, Password: process.env.IRP_PASSWORD,
    AppKey: appKey.toString('base64'), ForceRefreshAccessToken: true });
  const data = crypto.publicEncrypt({ key: publicKey(), padding: crypto.constants.RSA_PKCS1_PADDING },
    Buffer.from(Buffer.from(plain).toString('base64'))).toString('base64');
  const b = await post(`${process.env.IRP_BASE_URL}/eivital/v1.04/auth`, headers(gstin), { Data: data });
  if (String(b?.Status) !== '1' || !b?.Data?.AuthToken) {
    const e = errorOf(b);
    throw new IrpError(e.code, `IRP login failed: ${e.message}`);
  }
  const sek = aes('dec', appKey, Buffer.from(b.Data.Sek, 'base64'));
  // Tokens last six hours; refresh ten minutes early
  const exp = Date.parse(String(b.Data.TokenExpiry).replace(' ', 'T') + '+05:30');
  session = { token: b.Data.AuthToken, sek, gstin, exp: (Number.isNaN(exp) ? Date.now() + 6 * 3600e3 : exp) - 600e3 };
  return session;
}

async function current(gstin: string) {
  return session && session.gstin === gstin && session.exp > Date.now() ? session : login(gstin);
}

// One encrypted call; a stale token (1005) is refreshed once
async function call(gstin: string, path: string, payload: unknown, retried = false): Promise<any> {
  const s = await current(gstin);
  const data = aes('enc', s.sek, Buffer.from(JSON.stringify(payload))).toString('base64');
  const b = await post(`${process.env.IRP_BASE_URL}${path}`, headers(gstin, { user_name: process.env.IRP_USERNAME!, AuthToken: s.token }), { Data: data });
  if (String(b?.Status) === '1') return JSON.parse(aes('dec', s.sek, Buffer.from(b.Data, 'base64')).toString('utf8'));
  const e = errorOf(b);
  if (e.code === '1005' && !retried) { session = null; return call(gstin, path, payload, true); }
  throw new IrpError(e.code, e.message, false, b?.InfoDtls);
}

export interface IrnResult { Irn: string; AckNo: string | number; AckDt: string; SignedInvoice?: string; SignedQRCode?: string }

export async function generateIrn(gstin: string, payload: unknown): Promise<IrnResult> {
  try {
    return await call(gstin, '/eicore/v1.03/Invoice', payload);
  } catch (e) {
    // 2150 = already registered: fetch the existing IRN instead of failing
    if (e instanceof IrpError && e.code === '2150') {
      const irn = (Array.isArray(e.info) ? e.info : []).find((i: any) => i?.InfoCode === 'DUPIRN')?.Desc?.Irn;
      if (irn) return getIrn(gstin, irn);
    }
    throw e;
  }
}

export async function getIrn(gstin: string, irn: string): Promise<IrnResult> {
  const s = await current(gstin);
  let res: Response;
  try {
    res = await fetch(`${process.env.IRP_BASE_URL}/eicore/v1.03/Invoice/irn/${encodeURIComponent(irn)}`, {
      headers: headers(gstin, { user_name: process.env.IRP_USERNAME!, AuthToken: s.token }), signal: AbortSignal.timeout(30_000) });
  } catch (e: any) {
    throw new IrpError('NETWORK', `IRP unreachable: ${e?.message || e}`, true);
  }
  const b: any = await res.json().catch(() => ({}));
  if (String(b?.Status) !== '1') { const e = errorOf(b); throw new IrpError(e.code, e.message, res.status >= 500); }
  return JSON.parse(aes('dec', s.sek, Buffer.from(b.Data, 'base64')).toString('utf8'));
}

export function resetIrpSession() { session = null; }
