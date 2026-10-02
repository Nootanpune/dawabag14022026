// Security review Sprint 34 — uploaded prescriptions and licence scans are typed by their bytes
import { sniffDocumentType, validateDocument } from './documentCheck';

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const JPG = Buffer.from('ffd8ffe000104a464946', 'hex');
const PDF = Buffer.from('%PDF-1.7\n%âãÏÓ\n', 'latin1');
const file = (buffer: Buffer, mimetype: string) => ({ buffer, mimetype, size: buffer.length });

describe('document check', () => {
  it('knows PDF, JPEG and PNG by their first bytes', () => {
    expect(sniffDocumentType(PDF)?.ext).toBe('pdf');
    expect(sniffDocumentType(JPG)?.ext).toBe('jpg');
    expect(sniffDocumentType(PNG)?.ext).toBe('png');
    expect(sniffDocumentType(Buffer.from('<html><script>alert(1)</script>'))).toBeNull();
  });
  it('accepts a file whose content matches its declared type', () => {
    expect(validateDocument(file(PNG, 'image/png'), { maxBytes: 1e6, what: 'File' }).contentType).toBe('image/png');
    expect(validateDocument(file(JPG, 'image/jpg'), { maxBytes: 1e6, what: 'File' }).contentType).toBe('image/jpeg');
  });
  it('refuses an HTML page named as a picture or PDF, a mismatch, an empty or too-large file', () => {
    expect(() => validateDocument(file(Buffer.from('<html></html>'), 'image/png'), { maxBytes: 1e6, what: 'File' })).toThrow(/Only PDF, JPG and PNG/);
    expect(() => validateDocument(file(PDF, 'image/png'), { maxBytes: 1e6, what: 'File' })).toThrow(/does not match/);
    expect(() => validateDocument(file(Buffer.alloc(0), 'image/png'), { maxBytes: 1e6, what: 'File' })).toThrow(/No file/);
    expect(() => validateDocument(file(Buffer.concat([PDF, Buffer.alloc(2000)]), 'application/pdf'), { maxBytes: 1000, what: 'File' }))
      .toThrow(/smaller/);
  });
});
