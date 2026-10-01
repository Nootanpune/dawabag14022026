// Fake S3-compatible object store (path-style: PUT/GET/HEAD /<bucket>/<key>), for
// running uploads (prescriptions, KYC files) locally. Objects live in this
// process's memory only and vanish when it stops — nothing touches the disk.
// Use with S3_ENDPOINT=<fakes base URL> and AWS_S3_BUCKET=FAKE_S3_BUCKET.
// Presigned GET links (product photos) are honoured like S3 does: an expired link
// is refused (403) and response-cache-control is echoed as Cache-Control.
// For the staging backup scripts (deploy/staging/backup) it also answers ListObjectsV2
// (GET /<bucket>?list-type=2&prefix=…), DELETE, and multipart uploads.
export const FAKE_S3_BUCKET = 'dawabag-fake-bucket';
export const objects = new Map();
const uploads = new Map();   // multipart upload id → Map(partNumber → Buffer)

export function isS3Request(req) {
  const path = new URL(req.url, 'http://x').pathname;
  return path === `/${FAKE_S3_BUCKET}` || path.startsWith(`/${FAKE_S3_BUCKET}/`);
}

// X-Amz-Date (20261001T101500Z) + X-Amz-Expires seconds, when the link is presigned
function linkExpired(params) {
  const d = params.get('X-Amz-Date'), ttl = Number(params.get('X-Amz-Expires'));
  if (!d || !ttl) return false;
  const at = Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${d.slice(9, 11)}:${d.slice(11, 13)}:${d.slice(13, 15)}Z`);
  return Date.now() > at + ttl * 1000;
}

export function handleS3(req, res, body) {
  const url = new URL(req.url, 'http://x');
  const key = decodeURIComponent(url.pathname.slice(FAKE_S3_BUCKET.length + 2));
  const q = url.searchParams;
  if (req.method === 'GET' && !key && q.get('list-type') === '2') return listObjects(res, q.get('prefix') || '');
  if (q.has('uploadId') || q.has('uploads')) return multipart(req, res, key, body, q);
  if (req.method === 'DELETE') {
    objects.delete(key);
    res.writeHead(204);
    return res.end();
  }
  if (req.method === 'PUT') {
    objects.set(key, { body, type: req.headers['content-type'] || 'application/octet-stream', at: new Date() });
    res.writeHead(200, { ETag: '"fake"' });
    return res.end();
  }
  if (linkExpired(url.searchParams)) {
    res.writeHead(403, { 'Content-Type': 'application/xml' });
    return res.end('<Error><Code>AccessDenied</Code><Message>Request has expired</Message></Error>');
  }
  const o = objects.get(key);
  if (!o) {
    res.writeHead(404, { 'Content-Type': 'application/xml' });
    return res.end('<Error><Code>NoSuchKey</Code></Error>');
  }
  const cache = url.searchParams.get('response-cache-control');
  res.writeHead(200, { 'Content-Type': o.type, 'Content-Length': o.body.length, ...(cache && { 'Cache-Control': cache }) });
  res.end(req.method === 'HEAD' ? undefined : o.body);
}

const xmlEscape = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ListObjectsV2, one page (the fake holds few objects)
function listObjects(res, prefix) {
  const rows = [...objects.entries()].filter(([k]) => k.startsWith(prefix)).sort(([a], [b]) => a.localeCompare(b));
  const contents = rows.map(([k, o]) => `<Contents><Key>${xmlEscape(k)}</Key><LastModified>${(o.at ?? new Date()).toISOString()}</LastModified>`
    + `<ETag>"fake"</ETag><Size>${o.body.length}</Size><StorageClass>STANDARD</StorageClass></Contents>`).join('');
  res.writeHead(200, { 'Content-Type': 'application/xml' });
  res.end(`<?xml version="1.0" encoding="UTF-8"?><ListBucketResult><Name>${FAKE_S3_BUCKET}</Name><Prefix>${xmlEscape(prefix)}</Prefix>`
    + `<KeyCount>${rows.length}</KeyCount><MaxKeys>1000</MaxKeys><IsTruncated>false</IsTruncated>${contents}</ListBucketResult>`);
}

// Create (POST ?uploads), part (PUT ?partNumber&uploadId), complete (POST ?uploadId), abort (DELETE ?uploadId)
function multipart(req, res, key, body, q) {
  const xml = (s) => { res.writeHead(200, { 'Content-Type': 'application/xml' }); res.end(`<?xml version="1.0" encoding="UTF-8"?>${s}`); };
  if (req.method === 'POST' && q.has('uploads')) {
    const id = `fake-upload-${uploads.size + 1}-${Date.now()}`;
    uploads.set(id, { key, type: req.headers['content-type'] || 'application/octet-stream', parts: new Map() });
    return xml(`<InitiateMultipartUploadResult><Bucket>${FAKE_S3_BUCKET}</Bucket><Key>${xmlEscape(key)}</Key><UploadId>${id}</UploadId></InitiateMultipartUploadResult>`);
  }
  const up = uploads.get(q.get('uploadId'));
  if (!up) { res.writeHead(404, { 'Content-Type': 'application/xml' }); return res.end('<Error><Code>NoSuchUpload</Code></Error>'); }
  if (req.method === 'PUT') {
    up.parts.set(Number(q.get('partNumber')), body);
    res.writeHead(200, { ETag: `"part-${q.get('partNumber')}"` });
    return res.end();
  }
  uploads.delete(q.get('uploadId'));
  if (req.method === 'DELETE') { res.writeHead(204); return res.end(); }
  const whole = Buffer.concat([...up.parts.entries()].sort(([a], [b]) => a - b).map(([, b]) => b));
  objects.set(up.key, { body: whole, type: up.type, at: new Date() });
  return xml(`<CompleteMultipartUploadResult><Bucket>${FAKE_S3_BUCKET}</Bucket><Key>${xmlEscape(up.key)}</Key><ETag>"fake-multipart"</ETag></CompleteMultipartUploadResult>`);
}
