// src/utils/documentCheck.ts — checks an uploaded document (prescription, licence scan)
// before it reaches the private object store. The file's own first bytes decide its type
// (magic numbers); the type the browser declared must agree, so a renamed HTML page,
// script or archive is refused (security review Sprint 34; C-41 private documents).
import { AppError } from './AppError';
import { sniffImageType } from './imageCheck';

export type DocumentType = { contentType: 'application/pdf' | 'image/jpeg' | 'image/png'; ext: 'pdf' | 'jpg' | 'png' };

/** PDF, JPEG or PNG by content; anything else is null. */
export function sniffDocumentType(buf: Buffer | undefined | null): DocumentType | null {
  if (!buf || !buf.length) return null;
  // "%PDF-" may follow a few junk bytes in some scanners' output; the spec allows 1 KB
  const head = buf.subarray(0, 1024).toString('latin1');
  if (head.includes('%PDF-')) return { contentType: 'application/pdf', ext: 'pdf' };
  const img = sniffImageType(buf);
  if (img?.contentType === 'image/jpeg') return { contentType: 'image/jpeg', ext: 'jpg' };
  if (img?.contentType === 'image/png') return { contentType: 'image/png', ext: 'png' };
  return null;
}

/**
 * The checked type of an uploaded PDF / JPEG / PNG, or a plain refusal.
 * maxBytes is checked on the bytes actually received, not only the declared size.
 */
export function validateDocument(file: { buffer: Buffer; mimetype: string; size: number } | undefined,
  opts: { maxBytes: number; what: string }): DocumentType {
  if (!file || !file.buffer?.length) throw new AppError('No file uploaded', 400);
  if (file.size > opts.maxBytes || file.buffer.length > opts.maxBytes) {
    throw new AppError(`${opts.what} must be ${Math.round(opts.maxBytes / (1024 * 1024))} MB or smaller`, 413);
  }
  const type = sniffDocumentType(file.buffer);
  if (!type) throw new AppError('Only PDF, JPG and PNG files are allowed', 400);
  const declared = file.mimetype === 'image/jpg' ? 'image/jpeg' : file.mimetype;
  if (declared !== type.contentType) throw new AppError('The file content does not match its type', 400);
  return type;
}
