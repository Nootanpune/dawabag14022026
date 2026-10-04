// Sprint 50 — client-side backup encryption (crypt.mjs) and its use by s3.mjs dump / get.
//   cd deploy/staging/backup && npm ci && node --test
// The round trip runs s3.mjs against the in-memory S3 fake from backend/test/fakes (nothing is
// written to disk; the fake's objects vanish with this process).
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { MAGIC, decryptStream, deriveKey, encryptStream, keysFromEnv, openBackupStream } from './crypt.mjs';
import { FAKE_S3_BUCKET, handleS3, objects } from '../../../backend/test/fakes/s3.mjs';

const KEY = 'a'.repeat(64), OLD = 'b'.repeat(64);

async function run(stream, input, chunk = 7) {
  const parts = [];
  for (let i = 0; i < input.length; i += chunk) parts.push(input.subarray(i, i + chunk));
  const out = [];
  await pipeline(Readable.from(parts.length ? parts : [Buffer.alloc(0)]), stream, async function* (src) { for await (const c of src) out.push(c); });
  return Buffer.concat(out);
}

test('encrypt then decrypt gives the same bytes, in any chunking; the ciphertext does not contain the plaintext', async () => {
  const plain = Buffer.concat([Buffer.from('PGDMP'), crypto.randomBytes(100_000)]);
  const k = deriveKey(KEY);
  const enc = await run(encryptStream(k), plain, 4096);
  assert.ok(enc.subarray(0, MAGIC.length).equals(MAGIC));
  assert.equal(enc.length, plain.length + 8 + 8 + 12 + 16);
  assert.equal(enc.indexOf(plain.subarray(0, 64)), -1);
  for (const size of [1, 5, 13, 16, 17, 4096, 1 << 20]) {
    assert.ok((await run(decryptStream([k]), enc, size)).equals(plain), `chunk ${size}`);
    assert.ok((await run(openBackupStream([k]), enc, size)).equals(plain), `sniff chunk ${size}`);
  }
});

test('a changed byte, a cut-off object or the wrong key fails the stream', async () => {
  const k = deriveKey(KEY);
  const enc = await run(encryptStream(k), crypto.randomBytes(5000));
  const flipped = Buffer.from(enc); flipped[100] ^= 1;
  await assert.rejects(run(decryptStream([k]), flipped), /does not authenticate/);
  await assert.rejects(run(decryptStream([k]), enc.subarray(0, enc.length - 3)), /does not authenticate|incomplete/);
  await assert.rejects(run(decryptStream([deriveKey(OLD)]), enc), /encrypted with another key/);
  await assert.rejects(run(openBackupStream([]), enc), /set BACKUP_ENC_KEY/);
});

test('after a rotation the previous key still opens old backups; short keys are refused', async () => {
  const oldEnc = await run(encryptStream(deriveKey(OLD)), Buffer.from('old backup'));
  const { current, all } = keysFromEnv({ BACKUP_ENC_KEY: KEY, BACKUP_ENC_KEY_PREVIOUS: ` ${OLD} ` });
  assert.ok(current.id.equals(deriveKey(KEY).id));
  assert.equal((await run(openBackupStream(all), oldEnc)).toString(), 'old backup');
  assert.throws(() => deriveKey('short'), /at least 32/);
  assert.deepEqual(keysFromEnv({}), { current: null, all: [] });
});

test('an unencrypted backup passes through unchanged (and is noted)', async () => {
  let noted = 0;
  const plain = Buffer.from('PGDMP plain custom-format dump');
  assert.ok((await run(openBackupStream([deriveKey(KEY)], () => noted++), plain, 3)).equals(plain));
  assert.equal(noted, 1);
});

test('s3.mjs dump stores only ciphertext with BACKUP_ENC_KEY, and get restores the exact bytes', async (t) => {
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c)).on('end', () => handleS3(req, res, Buffer.concat(chunks)));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  const here = fileURLToPath(new URL('.', import.meta.url));
  const env = {
    ...process.env, S3_ENDPOINT: `http://127.0.0.1:${server.address().port}`, AWS_S3_BUCKET: FAKE_S3_BUCKET,
    AWS_REGION: 'ap-south-1', AWS_ACCESS_KEY_ID: 'test', AWS_SECRET_ACCESS_KEY: 'test', BACKUP_SSE: 'none', BACKUP_PART_MB: '5',
    AWS_EC2_METADATA_DISABLED: 'true',
  };
  const s3 = (args, extra = {}) => new Promise((resolve) => {
    const p = spawn(process.execPath, [`${here}s3.mjs`, ...args], { env: { ...env, ...extra } });
    const out = [], err = [];
    p.stdout.on('data', (c) => out.push(c)); p.stderr.on('data', (c) => err.push(c));
    p.on('close', (code) => resolve({ code, out: Buffer.concat(out), err: Buffer.concat(err).toString() }));
  });
  // 12 MB of "dump": more than two multipart parts of 5 MB
  const dumpCmd = ['--', process.execPath, '-e', "const c=require('crypto');let s=Buffer.from('seed');for(let i=0;i<192;i++){s=c.createHash('sha256').update(s).digest();const b=Buffer.alloc(65536,s);process.stdout.write(b);}"];
  const expected = await new Promise((resolve) => {
    const p = spawn(dumpCmd[1], dumpCmd.slice(2)); const out = [];
    p.stdout.on('data', (c) => out.push(c)); p.on('close', () => resolve(Buffer.concat(out)));
  });
  const enc = await s3(['dump', 'backups/daily/t/enc.dump', ...dumpCmd], { BACKUP_ENC_KEY: KEY });
  assert.equal(enc.code, 0, enc.err);
  const stored = objects.get('backups/daily/t/enc.dump').body;
  assert.ok(stored.subarray(0, MAGIC.length).equals(MAGIC), 'stored object is encrypted');
  assert.equal(stored.indexOf(expected.subarray(0, 4096)), -1, 'no plaintext in the store');
  const back = await s3(['get', 'backups/daily/t/enc.dump'], { BACKUP_ENC_KEY: KEY });
  assert.equal(back.code, 0, back.err);
  assert.ok(back.out.equals(expected), 'restored bytes are identical');
  const noKey = await s3(['get', 'backups/daily/t/enc.dump']);
  assert.notEqual(noKey.code, 0);
  assert.match(noKey.err, /encrypted/);
  // Unchanged without a key: plain objects, plain restore
  const plain = await s3(['dump', 'backups/daily/t/plain.dump', ...dumpCmd]);
  assert.equal(plain.code, 0, plain.err);
  assert.ok(objects.get('backups/daily/t/plain.dump').body.equals(expected));
  const plainBack = await s3(['get', 'backups/daily/t/plain.dump'], { BACKUP_ENC_KEY: KEY });
  assert.ok(plainBack.out.equals(expected));
  assert.match(plainBack.err, /not client-side encrypted/);
  // A failing dump stores nothing, encrypted or not
  const bad = await s3(['dump', 'backups/daily/t/bad.dump', '--', process.execPath, '-e', 'process.stdout.write("x");process.exit(3)'], { BACKUP_ENC_KEY: KEY });
  assert.notEqual(bad.code, 0);
  assert.equal(objects.has('backups/daily/t/bad.dump'), false);
});
