// src/utils/zipGuard.ts — refuses a "zip bomb" before an .xlsx workbook is opened.
// An .xlsx file is a ZIP archive; the Excel reader (exceljs → JSZip) unpacks every part
// fully in memory and only then checks sizes, so a 5 MB upload could expand to gigabytes
// and stop the API for every user (security review Sprint 34). This reads the archive's
// directory, limits the number of parts and their total unpacked size, and unpacks each
// compressed part with a hard output cap so a part that lies about its size is caught
// without ever producing more than the cap. Nothing is written to disk (standing rule).
import zlib from 'zlib';
import { AppError } from './AppError';

export const ZIP_MAX_ENTRIES = 2_000;
export const ZIP_MAX_UNPACKED_BYTES = 60 * 1024 * 1024;

const EOCD_SIG = 0x06054b50;
const CEN_SIG = 0x02014b50;
const LOC_SIG = 0x04034b50;

const refuse = (why: string) =>
  new AppError(`This Excel file could not be read safely (${why}). Open it in Excel, save it again as .xlsx (or CSV) and upload that`, 422);

function findEndOfDirectory(buf: Buffer): number {
  // The end record is in the last 22 + 65,535 bytes (comment up to 64 KB)
  const stop = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= stop; i--) if (buf.readUInt32LE(i) === EOCD_SIG) return i;
  return -1;
}

/** Throws a plain 422 unless the ZIP's parts are few enough and unpack within the limits. */
export function assertSafeZip(buf: Buffer, limits = { maxEntries: ZIP_MAX_ENTRIES, maxUnpacked: ZIP_MAX_UNPACKED_BYTES }): void {
  const eocd = findEndOfDirectory(buf);
  if (eocd < 0) throw refuse('not a complete archive');
  const entries = buf.readUInt16LE(eocd + 10);
  const dirSize = buf.readUInt32LE(eocd + 12);
  const dirOffset = buf.readUInt32LE(eocd + 16);
  if (entries === 0xffff || dirOffset === 0xffffffff) throw refuse('ZIP64 archives are not accepted');
  if (entries > limits.maxEntries) throw refuse(`more than ${limits.maxEntries} parts`);
  if (dirOffset + dirSize > buf.length) throw refuse('damaged archive');

  let pos = dirOffset;
  let total = 0;
  for (let n = 0; n < entries; n++) {
    if (pos + 46 > buf.length || buf.readUInt32LE(pos) !== CEN_SIG) throw refuse('damaged archive');
    const method = buf.readUInt16LE(pos + 10);
    const packed = buf.readUInt32LE(pos + 20);
    const declared = buf.readUInt32LE(pos + 24);
    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    const local = buf.readUInt32LE(pos + 42);
    pos += 46 + nameLen + extraLen + commentLen;

    total += declared;
    if (total > limits.maxUnpacked) throw refuse('it unpacks to more than the allowed size');
    if (local + 30 > buf.length || buf.readUInt32LE(local) !== LOC_SIG) throw refuse('damaged archive');
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    if (start + packed > buf.length) throw refuse('damaged archive');
    if (method === 0) {
      if (packed !== declared) throw refuse('damaged archive');
      continue;
    }
    if (method !== 8) throw refuse('unsupported compression');
    // Unpack with a cap one byte above the declared size: a part that is larger than it
    // says fails here after at most that many bytes (zlib stops at maxOutputLength)
    let out: Buffer;
    try {
      out = zlib.inflateRawSync(buf.subarray(start, start + packed), { maxOutputLength: Math.max(1, declared + 1) });
    } catch { throw refuse('a part is larger than it declares or is damaged'); }
    if (out.length !== declared) throw refuse('a part is larger than it declares or is damaged');
  }
}
