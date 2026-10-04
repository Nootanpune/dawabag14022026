// Client-side encryption of database backups (Sprint 50; deploy/staging/backup/s3.mjs).
// With BACKUP_ENC_KEY set, every dump is encrypted HERE, before it leaves the server, with
// AES-256-GCM — so the backup bucket (offsite, another region, another provider's staff)
// only ever holds ciphertext, on top of the store's own server-side encryption (C-41, C-44).
// Without the key nothing changes (staging, the trial, older backups stay readable).
//
// Object layout:  "DWBENC1\n" (8) | key id (8) | IV (12) | ciphertext … | GCM tag (16)
// The key id (first 8 bytes of SHA-256 of the derived key) picks the right key on restore:
// BACKUP_ENC_KEY, or one of BACKUP_ENC_KEY_PREVIOUS (comma-separated) after a rotation.
// LOSING THE KEY MAKES EVERY BACKUP ENCRYPTED WITH IT UNREADABLE — keep it in the owner's
// password manager next to PRODUCTION_ENV (docs/PRODUCTION.md "Secrets").
import crypto from 'node:crypto';
import { Transform } from 'node:stream';

export const MAGIC = Buffer.from('DWBENC1\n');
const ID_LEN = 8, IV_LEN = 12, TAG_LEN = 16;
export const HEADER_LEN = MAGIC.length + ID_LEN + IV_LEN;

/** The 32-byte AES key and its id for one configured key string (at least 32 characters). */
export function deriveKey(secret) {
  const s = String(secret ?? '').trim();
  if (s.length < 32) throw new Error('BACKUP_ENC_KEY must be at least 32 characters');
  const key = Buffer.from(crypto.hkdfSync('sha256', Buffer.from(s, 'utf8'), Buffer.from('dawabag-backup'), Buffer.from('aes-256-gcm v1'), 32));
  return { key, id: crypto.createHash('sha256').update(key).digest().subarray(0, ID_LEN) };
}

/** Keys from the environment: the current one first (encrypts), then previous ones (decrypt only). */
export function keysFromEnv(env = process.env) {
  const current = (env.BACKUP_ENC_KEY ?? '').trim();
  const previous = (env.BACKUP_ENC_KEY_PREVIOUS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return { current: current ? deriveKey(current) : null, all: [current, ...previous].filter(Boolean).map(deriveKey) };
}

/** A stream that turns plaintext into the layout above. */
export function encryptStream({ key, id }) {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let started = false;
  return new Transform({
    transform(chunk, _enc, done) {
      if (!started) { this.push(Buffer.concat([MAGIC, id, iv])); started = true; }
      done(null, cipher.update(chunk));
    },
    flush(done) {
      if (!started) this.push(Buffer.concat([MAGIC, id, iv]));
      try { done(null, Buffer.concat([cipher.final(), cipher.getAuthTag()])); } catch (e) { done(e); }
    },
  });
}

/** Synchronous decryptor for the layout above: update(chunk) → plaintext so far; final() checks the tag. */
function decryptor(keys) {
  let header = Buffer.alloc(0), decipher = null, tail = Buffer.alloc(0);
  return {
    update(chunk) {
      if (!decipher) {
        header = Buffer.concat([header, chunk]);
        if (header.length < HEADER_LEN) return Buffer.alloc(0);
        if (!header.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('not a Dawabag encrypted backup');
        const id = header.subarray(MAGIC.length, MAGIC.length + ID_LEN);
        const k = keys.find((x) => x.id.equals(id));
        if (!k) throw new Error(`this backup was encrypted with another key (id ${id.toString('hex')}); set it in BACKUP_ENC_KEY or BACKUP_ENC_KEY_PREVIOUS`);
        decipher = crypto.createDecipheriv('aes-256-gcm', k.key, header.subarray(MAGIC.length + ID_LEN, HEADER_LEN));
        chunk = header.subarray(HEADER_LEN);
      }
      // The last 16 bytes may be the tag: hold them back until the next chunk or the end
      const data = Buffer.concat([tail, chunk]);
      const cut = Math.max(0, data.length - TAG_LEN);
      tail = data.subarray(cut);
      return cut ? decipher.update(data.subarray(0, cut)) : Buffer.alloc(0);
    },
    final() {
      if (!decipher || tail.length !== TAG_LEN) throw new Error('the encrypted backup is incomplete');
      try {
        decipher.setAuthTag(tail);
        return decipher.final();
      } catch {
        throw new Error('the encrypted backup does not authenticate (wrong key, or the object was changed)');
      }
    },
  };
}

/**
 * A stream that checks and removes the layout above. A wrong key, a changed byte or a cut-off
 * object fails the stream at the end, so `s3.mjs get | pg_restore` exits non-zero and
 * restore.sh refuses the copy (and --into-live never swaps it in: the check restore comes first).
 */
export function decryptStream(keys) {
  const d = decryptor(keys);
  return new Transform({
    transform(chunk, _enc, done) { try { done(null, d.update(chunk)); } catch (e) { done(e); } },
    flush(done) { try { done(null, d.final()); } catch (e) { done(e); } },
  });
}

/**
 * For restores: decrypts an encrypted backup (recognised by its first bytes, so it does not
 * depend on object metadata) and passes an unencrypted one through unchanged (a backup made
 * before BACKUP_ENC_KEY was set; `onPlain` is told so it can be logged).
 */
export function openBackupStream(keys, onPlain = () => {}) {
  let head = Buffer.alloc(0), mode = 'sniff', d = null;
  return new Transform({
    transform(chunk, _enc, done) {
      try {
        if (mode === 'plain') return done(null, chunk);
        if (mode === 'enc') return done(null, d.update(chunk));
        head = Buffer.concat([head, chunk]);
        if (head.length < MAGIC.length) return done();
        const first = head; head = null;
        if (first.subarray(0, MAGIC.length).equals(MAGIC)) {
          if (!keys.length) throw new Error('this backup is encrypted (client-side): set BACKUP_ENC_KEY (and BACKUP_ENC_KEY_PREVIOUS after a rotation)');
          mode = 'enc'; d = decryptor(keys);
          return done(null, d.update(first));
        }
        mode = 'plain'; onPlain();
        return done(null, first);
      } catch (e) { return done(e); }
    },
    flush(done) {
      try {
        if (mode === 'enc') return done(null, d.final());
        if (mode === 'sniff' && head?.length) { onPlain(); return done(null, head); }
        return done();
      } catch (e) { return done(e); }
    },
  });
}
