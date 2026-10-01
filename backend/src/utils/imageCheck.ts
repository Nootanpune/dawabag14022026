// src/utils/imageCheck.ts — checks an uploaded product pack photo before it is
// stored. The file's own bytes decide its type (magic numbers); the browser's
// declared mimetype must agree, so a renamed PDF or script is refused.
import { AppError } from './AppError';

export const PRODUCT_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

export type ProductImageType = { contentType: 'image/jpeg' | 'image/png' | 'image/webp'; ext: 'jpg' | 'png' | 'webp' };

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function sniffImageType(buf: Buffer): ProductImageType | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { contentType: 'image/jpeg', ext: 'jpg' };
  if (buf.length >= 8 && buf.subarray(0, 8).equals(PNG_SIGNATURE)) return { contentType: 'image/png', ext: 'png' };
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return { contentType: 'image/webp', ext: 'webp' };
  }
  return null;
}

export function validateProductImage(file: { buffer: Buffer; mimetype: string; size: number } | undefined): ProductImageType {
  if (!file || !file.buffer?.length) throw new AppError('No photo uploaded', 400);
  if (file.size > PRODUCT_IMAGE_MAX_BYTES || file.buffer.length > PRODUCT_IMAGE_MAX_BYTES) {
    throw new AppError('Photo must be 2 MB or smaller', 413);
  }
  const type = sniffImageType(file.buffer);
  if (!type) throw new AppError('Only JPEG, PNG and WebP photos are allowed', 400);
  const declared = file.mimetype === 'image/jpg' ? 'image/jpeg' : file.mimetype;
  if (declared !== type.contentType) throw new AppError('The file content does not match its type', 400);
  return type;
}
