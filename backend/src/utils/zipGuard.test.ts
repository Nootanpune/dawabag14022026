// Security review Sprint 34 — zip bombs are refused before an .xlsx is unpacked
import zlib from 'zlib';
import ExcelJS from 'exceljs';
import { assertSafeZip } from './zipGuard';

/** A minimal ZIP (deflate) with the given parts; `lie` sets a smaller declared size. */
function zip(parts: { name: string; data: Buffer; lie?: number }[]): Buffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const p of parts) {
    const packed = zlib.deflateRawSync(p.data);
    const name = Buffer.from(p.name);
    const size = p.lie ?? p.data.length;
    const loc = Buffer.alloc(30);
    loc.writeUInt32LE(0x04034b50, 0); loc.writeUInt16LE(20, 4); loc.writeUInt16LE(8, 8);
    loc.writeUInt32LE(packed.length, 18); loc.writeUInt32LE(size, 22); loc.writeUInt16LE(name.length, 26);
    locals.push(loc, name, packed);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(8, 10);
    cen.writeUInt32LE(packed.length, 20); cen.writeUInt32LE(size, 24); cen.writeUInt16LE(name.length, 28);
    cen.writeUInt32LE(offset, 42);
    central.push(cen, name);
    offset += 30 + name.length + packed.length;
  }
  const dir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(parts.length, 8); end.writeUInt16LE(parts.length, 10);
  end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}

describe('zip guard', () => {
  it('a real workbook passes', async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('Report').addRows([['Item Name', 'Batch', 'Expiry', 'MRP', 'Qty'], ['GAMMA SYP', 'G1', '06/28', 99, 4]]);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    expect(() => assertSafeZip(buf)).not.toThrow();
  });
  it('a small file that unpacks to more than the limit is refused (honest sizes)', () => {
    const bomb = zip([{ name: 'xl/worksheets/sheet1.xml', data: Buffer.alloc(70 * 1024 * 1024) }]);
    expect(bomb.length).toBeLessThan(200 * 1024);
    expect(() => assertSafeZip(bomb)).toThrow(/unpacks to more than/);
  });
  it('a part that lies about its size is caught without unpacking it all', () => {
    const liar = zip([{ name: 'xl/worksheets/sheet1.xml', data: Buffer.alloc(200 * 1024 * 1024), lie: 1000 }]);
    const t = Date.now();
    expect(() => assertSafeZip(liar)).toThrow(/larger than it declares/);
    expect(Date.now() - t).toBeLessThan(2000);
  });
  it('too many parts, and things that are not archives, are refused', () => {
    const many = zip(Array.from({ length: 30 }, (_, i) => ({ name: `p${i}`, data: Buffer.from('x') })));
    expect(() => assertSafeZip(many, { maxEntries: 20, maxUnpacked: 1e6 })).toThrow(/more than 20 parts/);
    expect(() => assertSafeZip(Buffer.from('PK\u0003\u0004 not really a zip'))).toThrow(/not a complete archive/);
  });
});
