// Fake GST Invoice Registration Portal: the common NIC e-invoice API with its real
// encryption (RSA login, AES-256-ECB session key), plus switches the tests flip.
import crypto from 'crypto';

export const irp = { payloads: [], docs: new Map(), down: false, tokens: new Map() };
export const expireIrpTokens = () => irp.tokens.clear();

const key = () => crypto.createPrivateKey({ key: Buffer.from(process.env.FAKE_IRP_PRIVATE_KEY, 'base64'), format: 'der', type: 'pkcs8' });
const aes = (mode, k, data) => {
  const c = mode === 'enc' ? crypto.createCipheriv('aes-256-ecb', k, null) : crypto.createDecipheriv('aes-256-ecb', k, null);
  return Buffer.concat([c.update(data), c.final()]);
};
// RSA PKCS#1 v1.5 decryption by hand (Node refuses it by default)
function rsaPkcs1Decrypt(buf) {
  const raw = crypto.privateDecrypt({ key: key(), padding: crypto.constants.RSA_NO_PADDING }, buf);
  if (raw[0] !== 0 || raw[1] !== 2) throw new Error('bad padding');
  return raw.subarray(raw.indexOf(0, 2) + 1);
}
const fail = (code, message, info) => [200, { Status: 0, ErrorDetails: [{ ErrorCode: code, ErrorMessage: message }], ...(info ? { InfoDtls: info } : {}) }];
const ist = (ms) => new Date(ms + 5.5 * 3600e3).toISOString().slice(0, 19).replace('T', ' ');
const near = (a, b) => Math.abs(a - b) < 0.011;

export function irpRoute(req, body) {
  const url = req.url;
  if (!url.startsWith('/eivital/') && !url.startsWith('/eicore/')) return null;
  if (irp.down) return [503, { message: 'Service unavailable' }];
  if (req.headers.client_id !== process.env.IRP_CLIENT_ID || req.headers.client_secret !== process.env.IRP_CLIENT_SECRET) return fail('1004', 'Invalid client');
  if (url === '/eivital/v1.04/auth') {
    const creds = JSON.parse(Buffer.from(rsaPkcs1Decrypt(Buffer.from(JSON.parse(body).Data, 'base64')).toString(), 'base64').toString());
    if (creds.UserName !== process.env.IRP_USERNAME || creds.Password !== process.env.IRP_PASSWORD) return fail('1002', 'Invalid username or password');
    const sek = crypto.randomBytes(32), token = crypto.randomBytes(12).toString('hex');
    irp.tokens.set(token, { sek, gstin: req.headers.gstin });
    return [200, { Status: 1, Data: { AuthToken: token, Sek: aes('enc', Buffer.from(creds.AppKey, 'base64'), sek).toString('base64'), TokenExpiry: ist(Date.now() + 6 * 3600e3) } }];
  }
  const s = irp.tokens.get(req.headers.authtoken);
  if (!s) return fail('1005', 'Invalid Token');
  const reply = (obj) => [200, { Status: 1, Data: aes('enc', s.sek, Buffer.from(JSON.stringify(obj))).toString('base64') }];
  const irnGet = url.match(/^\/eicore\/v1\.03\/Invoice\/irn\/(.+)$/);
  if (irnGet) {
    const d = [...irp.docs.values()].find((x) => x.Irn === decodeURIComponent(irnGet[1]));
    return d ? reply(d) : fail('2283', 'IRN details not found');
  }
  if (url !== '/eicore/v1.03/Invoice') return [404, { message: 'no such fake endpoint' }];
  const p = JSON.parse(aes('dec', s.sek, Buffer.from(JSON.parse(body).Data, 'base64')).toString());
  irp.payloads.push(p);
  // The checks a real IRP makes that matter here
  if (p.SellerDtls?.Gstin !== s.gstin) return fail('2265', 'Seller GSTIN does not match the logged-in GSTIN');
  if (!/^[A-Z1-9][A-Z0-9/-]{0,15}$/.test(p.DocDtls?.No || '')) return fail('2219', 'Invalid document number');
  if (String(p.BuyerDtls?.Gstin).startsWith('99')) return fail('3028', 'GSTIN is invalid');
  for (const i of p.ItemList) {
    if (!near(i.TotItemVal, i.AssAmt + i.CgstAmt + i.SgstAmt + i.IgstAmt)) return fail('2189', `Item ${i.SlNo}: total item value mismatch`);
    if (!/^\d{4,8}$/.test(i.HsnCd)) return fail('2233', `Item ${i.SlNo}: invalid HSN`);
  }
  const sum = (k) => p.ItemList.reduce((t, i) => t + i[k], 0);
  if (!near(p.ValDtls.AssVal, sum('AssAmt')) || !near(p.ValDtls.TotInvVal, sum('TotItemVal'))) return fail('2172', 'Invoice value mismatch');
  const docKey = `${p.SellerDtls.Gstin}|${p.DocDtls.Typ}|${p.DocDtls.No}`;
  const existing = irp.docs.get(docKey);
  if (existing) return fail('2150', 'Duplicate IRN', [{ InfoCode: 'DUPIRN', Desc: { AckNo: existing.AckNo, AckDt: existing.AckDt, Irn: existing.Irn } }]);
  const Irn = crypto.createHash('sha256').update(docKey).digest('hex');
  const doc = { AckNo: 112610000000000 + irp.docs.size + 1, AckDt: ist(Date.now()), Irn,
    SignedInvoice: `signed.${Buffer.from(JSON.stringify({ DocNo: p.DocDtls.No })).toString('base64url')}.sig`,
    SignedQRCode: `qr.${Buffer.from(JSON.stringify({ Irn, DocNo: p.DocDtls.No, TotInvVal: p.ValDtls.TotInvVal })).toString('base64url')}.sig`, Status: 'ACT' };
  irp.docs.set(docKey, doc);
  return reply(doc);
}
