// Object-store helper for the staging database backups (deploy/staging/backup).
// Streams bytes between a process and S3 (or an S3-compatible store) without ever
// writing them to a local disk: the object store is the only place a backup lives
// (standing rule — the server is the single source of truth; C-41 data protection).
//
//   node s3.mjs dump <key> -- pg_dump …   run the command, stream its stdout to <key>;
//                                         the object appears only if the command exits 0
//                                         (BACKUP_CHAIN_HEADS: JSON of the chain heads, stored in
//                                         the object's metadata and as <key>.heads.json; Sprint 41)
//   node s3.mjs get <key>                 object → stdout
//   node s3.mjs heads <key>               the chain heads recorded with that backup, checked
//                                         against the checksum in the dump's metadata
//   node s3.mjs latest                    newest backup: "<key>\t<last-modified epoch s>"
//   node s3.mjs has <prefix>              exit 0 when any object starts with <prefix>
//   node s3.mjs prune                     delete expired backups (only for stores
//                                         without lifecycle rules; see RUNBOOK 7c)
//   node s3.mjs ensure-bucket             create the bucket if missing (the trial's own
//                                         object store, compose profile objectstore) and
//                                         prove an encrypted write works there
//
// Settings (environment): BACKUP_S3_BUCKET (else AWS_S3_BUCKET), BACKUP_S3_ENDPOINT
// (else S3_ENDPOINT; path-style, for S3-compatible stores), AWS_REGION,
// BACKUP_AWS_ACCESS_KEY_ID / BACKUP_AWS_SECRET_ACCESS_KEY (else the normal AWS
// credential chain), BACKUP_PREFIX (default "backups/"), BACKUP_SSE (AES256 default,
// aws:kms with BACKUP_KMS_KEY_ID, or none for a store that rejects the header),
// BACKUP_PART_MB (multipart part size, default 64; S3 needs at least 5).
// Exit codes: 0 ok, 1 failure, 2 usage, 3 backup storage not configured, 4 no backup found.
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import {
  AbortMultipartUploadCommand, CompleteMultipartUploadCommand, CreateBucketCommand, CreateMultipartUploadCommand,
  DeleteObjectCommand, HeadBucketCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command,
  PutObjectCommand, S3Client, UploadPartCommand,
} from '@aws-sdk/client-s3';

const env = (name) => (process.env[name] ?? '').trim() || undefined;
const bucket = env('BACKUP_S3_BUCKET') ?? env('AWS_S3_BUCKET');
const endpoint = env('BACKUP_S3_ENDPOINT') ?? env('S3_ENDPOINT');
const prefix = env('BACKUP_PREFIX') ?? 'backups/';
const partSize = Math.max(1, Number(env('BACKUP_PART_MB') ?? 64)) * 1024 * 1024;
// Retention when pruning from here instead of a lifecycle rule: daily 35 days, the
// month's first backup 8 years (GST books, C-34; retention schedule C-44)
const DAILY_DAYS = Number(env('BACKUP_DAILY_DAYS') ?? 35);
const MONTHLY_DAYS = Number(env('BACKUP_MONTHLY_DAYS') ?? 2922);

function fail(msg, code = 1) { process.stderr.write(`s3: ${msg}\n`); process.exit(code); }

function client() {
  if (!bucket) fail('backup storage not configured (set BACKUP_S3_BUCKET or AWS_S3_BUCKET)', 3);
  const id = env('BACKUP_AWS_ACCESS_KEY_ID'), secret = env('BACKUP_AWS_SECRET_ACCESS_KEY');
  // An empty AWS_* variable (compose passes unset ones as "") must not shadow the chain
  for (const k of ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN']) if (!env(k)) delete process.env[k];
  return new S3Client({
    region: env('AWS_REGION') ?? 'ap-south-1',
    ...(id && secret && { credentials: { accessKeyId: id, secretAccessKey: secret } }),
    ...(endpoint && {
      endpoint, forcePathStyle: true,
      // Many S3-compatible stores reject the newer default checksum headers
      requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED',
    }),
  });
}

function encryption() {
  const sse = env('BACKUP_SSE') ?? 'AES256';
  if (sse === 'none') return {};
  return { ServerSideEncryption: sse, ...(sse === 'aws:kms' && env('BACKUP_KMS_KEY_ID') && { SSEKMSKeyId: env('BACKUP_KMS_KEY_ID') }) };
}

// Runs the command and streams its stdout to <key> in parts. Nothing is committed
// until the command has exited 0, so a failed or interrupted dump never leaves a
// truncated object that looks like a good backup.
async function dump(key, cmd) {
  if (!key || !cmd.length) fail('usage: dump <key> -- <command …>', 2);
  const s3 = client();
  const child = spawn(cmd[0], cmd.slice(1), { stdio: ['ignore', 'pipe', 'inherit'] });
  const exited = new Promise((resolve) => {
    child.on('error', (e) => { process.stderr.write(`s3: cannot start ${cmd[0]}: ${e.message}\n`); resolve(127); });
    child.on('close', (code, signal) => resolve(code ?? (signal ? 128 : 1)));
  });
  // Sprint 41: the chain heads read just before the dump (backup.sh, heads.sql) go into the
  // object's metadata (audit head, number of H1 registers, SHA-256 of the full list) and, in
  // full, into <key>.heads.json beside it — a copy of the heads outside the database (C-09, C-46)
  const heads = chainHeads();
  const meta = { ContentType: 'application/octet-stream', Metadata: { source: 'dawabag-staging-backup', ...(heads?.metadata ?? {}) }, ...encryption() };
  let uploadId, total = 0, buffered = [], size = 0;
  const parts = [];
  const sendPart = async (body) => {
    if (!uploadId) uploadId = (await s3.send(new CreateMultipartUploadCommand({ Bucket: bucket, Key: key, ...meta }))).UploadId;
    const PartNumber = parts.length + 1;
    const { ETag } = await s3.send(new UploadPartCommand({ Bucket: bucket, Key: key, UploadId: uploadId, PartNumber, Body: body }));
    parts.push({ ETag, PartNumber });
  };
  try {
    for await (const chunk of child.stdout) {
      buffered.push(chunk); size += chunk.length; total += chunk.length;
      if (size >= partSize) { const body = Buffer.concat(buffered); buffered = []; size = 0; await sendPart(body); }
    }
    const code = await exited;
    if (code !== 0) throw new Error(`${cmd[0]} exited with ${code}; nothing was stored`);
    if (total === 0) throw new Error(`${cmd[0]} produced no output; nothing was stored`);
    const rest = Buffer.concat(buffered);
    if (!uploadId) {
      await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: rest, ...meta }));
    } else {
      if (rest.length) await sendPart(rest);
      await s3.send(new CompleteMultipartUploadCommand({ Bucket: bucket, Key: key, UploadId: uploadId, MultipartUpload: { Parts: parts } }));
    }
  } catch (e) {
    child.kill('SIGTERM');
    if (uploadId) await s3.send(new AbortMultipartUploadCommand({ Bucket: bucket, Key: key, UploadId: uploadId })).catch(() => undefined);
    fail(e.message ?? String(e));
  }
  // Read back what the store holds and compare with what was sent
  const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  if (Number(head.ContentLength) !== total) fail(`stored size ${head.ContentLength} differs from ${total} bytes sent`);
  if (heads) {
    try {
      await s3.send(new PutObjectCommand({ Bucket: bucket, Key: `${key}.heads.json`, Body: heads.text, ContentType: 'application/json',
        Metadata: { source: 'dawabag-staging-backup', 'backup-key': key, 'chain-heads-sha256': heads.metadata['chain-heads-sha256'] }, ...encryption() }));
    } catch (e) {
      // The dump and its metadata (audit head + checksum) are stored; only the full list is missing
      process.stderr.write(`s3: WARNING chain heads list not stored beside ${key}: ${e?.message || e}\n`);
    }
  }
  process.stdout.write(`${total}${heads ? ` ${heads.summary}` : ''}\n`);
}

/** BACKUP_CHAIN_HEADS (JSON from heads.sql) → object metadata, the sidecar text and a log summary. */
function chainHeads() {
  const text = (process.env.BACKUP_CHAIN_HEADS ?? '').trim();
  if (!text) return null;
  let h;
  try { h = JSON.parse(text); } catch { process.stderr.write('s3: WARNING BACKUP_CHAIN_HEADS is not JSON; stored without chain heads\n'); return null; }
  const registers = Object.keys(h.h1 ?? {}).length;
  const audit = h.audit ? `${h.audit.last_no}:${h.audit.head_hash}` : 'none';
  return {
    text,
    metadata: {
      'chain-heads-sha256': crypto.createHash('sha256').update(text).digest('hex'),
      'chain-heads-taken-at': String(h.taken_at ?? ''),
      'chain-audit-head': audit,
      'chain-h1-registers': String(registers),
    },
    summary: `audit head ${h.audit ? h.audit.last_no : 'none'}, ${registers} H1 register head(s)`,
  };
}

/** The chain heads recorded with a backup (Sprint 41): the sidecar, checked against the dump's metadata. */
async function heads(key) {
  if (!key) fail('usage: heads <backup key>', 2);
  const s3 = client();
  const dumpHead = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  const want = dumpHead.Metadata?.['chain-heads-sha256'];
  if (!want) fail(`${key} was stored without chain heads (a backup from before Sprint 41)`, 4);
  let text;
  try {
    const out = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: `${key}.heads.json` }));
    text = await out.Body.transformToString();
  } catch {
    // Only the metadata: the audit head is still checkable
    const a = dumpHead.Metadata?.['chain-audit-head'] ?? 'none';
    const [last_no, head_hash] = a.split(':');
    process.stdout.write(`${JSON.stringify({ partial: true, audit: a === 'none' ? null : { last_no: Number(last_no), head_hash }, h1: {} })}\n`);
    return;
  }
  const got = crypto.createHash('sha256').update(text.trim()).digest('hex');
  if (got !== want) fail(`the chain heads beside ${key} do not match the checksum stored with the dump (changed after the backup?)`, 1);
  process.stdout.write(`${text.trim()}\n`);
}

async function get(key) {
  if (!key) fail('usage: get <key>', 2);
  const out = await client().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  await pipeline(out.Body, process.stdout);
}

async function* list(p) {
  const s3 = client();
  let ContinuationToken;
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: p, ContinuationToken }));
    for (const o of page.Contents ?? []) yield o;
    ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (ContinuationToken);
}

async function latest() {
  let best;
  for await (const o of list(prefix)) {
    if (!o.Key.endsWith('.dump')) continue;
    if (!best || new Date(o.LastModified) > new Date(best.LastModified)) best = o;
  }
  if (!best) fail(`no backup under s3://${bucket}/${prefix}`, 4);
  process.stdout.write(`${best.Key}\t${Math.floor(new Date(best.LastModified).getTime() / 1000)}\n`);
}

async function has(p) {
  if (!p) fail('usage: has <prefix>', 2);
  for await (const _ of list(p)) return;   // eslint-disable-line no-unused-vars
  process.exit(1);
}

async function prune() {
  const s3 = client(), now = Date.now(), day = 86400e3;
  let removed = 0;
  for (const [tier, days] of [['daily/', DAILY_DAYS], ['monthly/', MONTHLY_DAYS]]) {
    for await (const o of list(prefix + tier)) {
      if (now - new Date(o.LastModified).getTime() <= days * day) continue;
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: o.Key }));
      process.stdout.write(`pruned ${o.Key}\n`);
      removed++;
    }
  }
  process.stdout.write(`pruned ${removed} object(s)\n`);
}

// The bucket stays private (no policy is set): the website gets only signed links
async function ensureBucket() {
  const s3 = client();
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    process.stdout.write(`bucket ${bucket} exists\n`);
  } catch (e) {
    if (e?.$metadata?.httpStatusCode !== 404 && e?.name !== 'NotFound' && e?.name !== 'NoSuchBucket') throw e;
    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
    process.stdout.write(`bucket ${bucket} created\n`);
  }
  // Server-side encryption must work here, as for every document (C-41)
  const Key = '.objectstore-check';
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key, Body: 'ok', ...encryption() }));
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key }));
  process.stdout.write('encrypted write ok\n');
}

const [command, arg, ...rest] = process.argv.slice(2);
const commands = {
  dump: () => dump(arg, rest[0] === '--' ? rest.slice(1) : rest),
  get: () => get(arg), latest, has: () => has(arg), prune, 'ensure-bucket': ensureBucket, heads: () => heads(arg),
};
if (!commands[command]) fail('usage: s3.mjs dump|get|latest|has|prune|ensure-bucket|heads …', 2);
commands[command]().catch((e) => fail(e?.name === 'NoSuchKey' ? `no such object: ${arg}` : (e?.message || String(e))));
