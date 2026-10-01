import { PRODUCT_IMAGE_MAX_BYTES, sniffImageType, validateProductImage } from './imageCheck';

const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(60)]);
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(60)]);
const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x40, 0, 0, 0]), Buffer.from('WEBPVP8 '), Buffer.alloc(52)]);
const file = (buffer: Buffer, mimetype: string) => ({ buffer, mimetype, size: buffer.length });

describe('product photo check', () => {
  it('recognises JPEG, PNG and WebP by their bytes', () => {
    expect(sniffImageType(jpeg)?.ext).toBe('jpg');
    expect(sniffImageType(png)?.ext).toBe('png');
    expect(sniffImageType(webp)?.ext).toBe('webp');
    expect(sniffImageType(Buffer.from('%PDF-1.7 hello'))).toBeNull();
    expect(sniffImageType(Buffer.from('GIF89a......'))).toBeNull();
    expect(sniffImageType(Buffer.from([0xff, 0xd8]))).toBeNull();
  });

  it('accepts a real photo whose declared type agrees', () => {
    expect(validateProductImage(file(jpeg, 'image/jpeg'))).toEqual({ contentType: 'image/jpeg', ext: 'jpg' });
    expect(validateProductImage(file(jpeg, 'image/jpg')).ext).toBe('jpg');
    expect(validateProductImage(file(png, 'image/png')).ext).toBe('png');
    expect(validateProductImage(file(webp, 'image/webp')).ext).toBe('webp');
  });

  it('refuses a file whose bytes are not an allowed image, even if labelled one', () => {
    expect(() => validateProductImage(file(Buffer.from('%PDF-1.7 not a photo'), 'image/jpeg'))).toThrow(/JPEG, PNG and WebP/);
    expect(() => validateProductImage(file(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/svg+xml'))).toThrow(/JPEG, PNG and WebP/);
  });

  it('refuses a mismatch between content and declared type', () => {
    expect(() => validateProductImage(file(png, 'image/jpeg'))).toThrow(/does not match/);
    expect(() => validateProductImage(file(jpeg, 'application/octet-stream'))).toThrow(/does not match/);
  });

  it('refuses a missing or empty file', () => {
    expect(() => validateProductImage(undefined)).toThrow(/No photo/);
    expect(() => validateProductImage(file(Buffer.alloc(0), 'image/png'))).toThrow(/No photo/);
  });

  it('refuses a photo over 2 MB with 413', () => {
    const big = Buffer.concat([jpeg, Buffer.alloc(PRODUCT_IMAGE_MAX_BYTES)]);
    try { validateProductImage(file(big, 'image/jpeg')); throw new Error('accepted'); }
    catch (e: any) { expect(e.statusCode).toBe(413); }
    const exact = Buffer.concat([jpeg, Buffer.alloc(PRODUCT_IMAGE_MAX_BYTES - jpeg.length)]);
    expect(validateProductImage(file(exact, 'image/jpeg')).ext).toBe('jpg');
  });
});
