// One throwaway HTTP server playing MSG91 (flow API), Google OAuth + FCM HTTP v1,
// Shiprocket, the GST IRP (irp.mjs), Razorpay (razorpay.mjs) and an S3-style store (s3.mjs). Every request is recorded in memory.
import crypto from 'crypto';
import http from 'http';
import { irpRoute } from './irp.mjs';
import { razorpayRoute } from './razorpay.mjs';
import { handleS3, isS3Request } from './s3.mjs';

export const seen = [];
const ACCESS = 'fake-google-access-token';
const SR_TOKEN = 'fake-shiprocket-token';
let awbNo = 0;

function serviceAccount() {
  const raw = process.env.FCM_SERVICE_ACCOUNT_JSON;
  return JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
}

// Checks the RS256 JWT the API signed with the service-account key
function jwtValid(assertion) {
  const [h, c, s] = String(assertion || '').split('.');
  if (!h || !c || !s) return false;
  const pub = crypto.createPublicKey(serviceAccount().private_key);
  const ok = crypto.createVerify('RSA-SHA256').update(`${h}.${c}`).verify(pub, Buffer.from(s, 'base64url'));
  const claims = JSON.parse(Buffer.from(c, 'base64url').toString());
  return ok && claims.iss === serviceAccount().client_email && /firebase\.messaging/.test(claims.scope) && claims.exp > Date.now() / 1000;
}

function route(req, body) {
  const fromIrp = irpRoute(req, body) ?? razorpayRoute(req, body);
  if (fromIrp) return fromIrp;
  const url = req.url;
  if (url === '/api/v5/whatsapp/whatsapp-outbound-message/bulk/') {
    if (req.headers.authkey !== process.env.MSG91_AUTH_KEY) return [401, { status: 'fail', message: 'bad authkey' }];
    const b = JSON.parse(body);
    if (b.integrated_number !== process.env.MSG91_WHATSAPP_NUMBER) return [400, { status: 'fail', message: 'unknown integrated number' }];
    return [200, { status: 'success', request_id: `wa-req-${seen.length}` }];
  }
  if (url === '/api/v5/flow/') {
    if (req.headers.authkey !== process.env.MSG91_AUTH_KEY) return [401, { type: 'error', message: 'bad authkey' }];
    return [200, { type: 'success', message: `msg91-req-${seen.length}` }];
  }
  if (url === '/token') {
    const form = new URLSearchParams(body);
    if (form.get('grant_type') !== 'urn:ietf:params:oauth:grant-type:jwt-bearer' || !jwtValid(form.get('assertion'))) return [400, { error: 'invalid_grant' }];
    return [200, { access_token: ACCESS, expires_in: 3600, token_type: 'Bearer' }];
  }
  if (/^\/v1\/projects\/[^/]+\/messages:send$/.test(url)) {
    if (req.headers.authorization !== `Bearer ${ACCESS}`) return [401, { error: { status: 'UNAUTHENTICATED' } }];
    const token = JSON.parse(body).message?.token || '';
    if (token.startsWith('dead-')) return [404, { error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } }];
    return [200, { name: `projects/dawabag-fake/messages/${seen.length}` }];
  }
  if (url === '/v1/external/auth/login') {
    const b = JSON.parse(body);
    if (b.email !== process.env.SHIPROCKET_EMAIL || b.password !== process.env.SHIPROCKET_PASSWORD) return [401, { message: 'Invalid credentials' }];
    return [200, { token: SR_TOKEN }];
  }
  if (url.startsWith('/v1/external/')) {
    if (req.headers.authorization !== `Bearer ${SR_TOKEN}`) return [401, { message: 'Unauthenticated' }];
    if (url === '/v1/external/orders/create/adhoc') return [200, { order_id: 7000 + seen.length, shipment_id: 9000 + seen.length, status: 'NEW' }];
    if (url === '/v1/external/courier/assign/awb') {
      awbNo++;
      return [200, { awb_assign_status: 1, response: { data: { awb_code: `S8AWB${Date.now() % 100000}${awbNo}`, courier_name: 'Delhivery Surface' } } }];
    }
  }
  return [404, { message: 'no such fake endpoint' }];
}

export function startFakes(port = Number(process.env.FAKE_PROVIDERS_PORT || 4890)) {
  const server = http.createServer((req, res) => {
    if (isS3Request(req)) {   // binary bodies: collected as bytes, not text
      const parts = [];
      req.on('data', (d) => parts.push(d));
      req.on('end', () => handleS3(req, res, Buffer.concat(parts)));
      return;
    }
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      let status, out;
      try { [status, out] = route(req, body); } catch (e) { [status, out] = [400, { message: String(e) }]; }
      seen.push({ method: req.method, url: req.url, headers: req.headers, body, status });
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(out));
    });
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

export const calls = (pathPart) => seen.filter((r) => r.url.includes(pathPart));
