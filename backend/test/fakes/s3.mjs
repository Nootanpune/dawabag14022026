// Fake S3-compatible object store (path-style: PUT/GET/HEAD /<bucket>/<key>), for
// running uploads (prescriptions, KYC files) locally. Objects live in this
// process's memory only and vanish when it stops — nothing touches the disk.
// Use with S3_ENDPOINT=<fakes base URL> and AWS_S3_BUCKET=FAKE_S3_BUCKET.
// Presigned GET links (product photos) are honoured like S3 does: an expired link
// is refused (403) and response-cache-control is echoed as Cache-Control.
export const FAKE_S3_BUCKET = 'dawabag-fake-bucket';
export const objects = new Map();

export function isS3Request(req) {
  return new URL(req.url, 'http://x').pathname.startsWith(`/${FAKE_S3_BUCKET}/`);
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
  if (req.method === 'PUT') {
    objects.set(key, { body, type: req.headers['content-type'] || 'application/octet-stream' });
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
