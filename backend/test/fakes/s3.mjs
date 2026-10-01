// Fake S3-compatible object store (path-style: PUT/GET/HEAD /<bucket>/<key>), for
// running uploads (prescriptions, KYC files) locally. Objects live in this
// process's memory only and vanish when it stops — nothing touches the disk.
// Use with S3_ENDPOINT=<fakes base URL> and AWS_S3_BUCKET=FAKE_S3_BUCKET.
export const FAKE_S3_BUCKET = 'dawabag-fake-bucket';
export const objects = new Map();

export function isS3Request(req) {
  return new URL(req.url, 'http://x').pathname.startsWith(`/${FAKE_S3_BUCKET}/`);
}

export function handleS3(req, res, body) {
  const key = decodeURIComponent(new URL(req.url, 'http://x').pathname.slice(FAKE_S3_BUCKET.length + 2));
  if (req.method === 'PUT') {
    objects.set(key, { body, type: req.headers['content-type'] || 'application/octet-stream' });
    res.writeHead(200, { ETag: '"fake"' });
    return res.end();
  }
  const o = objects.get(key);
  if (!o) {
    res.writeHead(404, { 'Content-Type': 'application/xml' });
    return res.end('<Error><Code>NoSuchKey</Code></Error>');
  }
  res.writeHead(200, { 'Content-Type': o.type, 'Content-Length': o.body.length });
  res.end(req.method === 'HEAD' ? undefined : o.body);
}
