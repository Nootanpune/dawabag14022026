// Security review Sprint 34 — stock files cannot tie up the API (time or memory)
import { parseDelimited, parseHtmlTable } from './delimited';
import { readStockFile, locateTable } from './readFile';

describe('stock file parsing limits', () => {
  it('HTML full of unclosed tags is read in linear time (the old regex took minutes)', () => {
    const html = `<table>${'<tr><td'.repeat(400_000)}`;
    const t = Date.now();
    parseHtmlTable(html, 10_100);
    expect(Date.now() - t).toBeLessThan(3000);
    const t2 = Date.now();
    parseHtmlTable(`<table>${'<tr x'.repeat(500_000)}`);
    expect(Date.now() - t2).toBeLessThan(3000);
  });
  it('still reads ordinary HTML tables (colspan, entities, cells without closing tags)', () => {
    const html = '<table><tr><td colspan="2">SHOP &amp; CO</td></tr><tr><th>Item</th><th>Qty</th></tr><tr><td>A<br>B<td>4</tr></table><table><tr><td>2nd</td></tr></table>';
    expect(parseHtmlTable(html)).toEqual([['SHOP & CO', ''], ['Item', 'Qty'], ['A B', '4']]);
  });
  it('a CSV of millions of lines is refused after the row limit, not built in memory', async () => {
    expect(parseDelimited('a,b\n'.repeat(50), ',', 10)).toHaveLength(11);
    await expect(readStockFile(Buffer.from('Item Name,Batch,Expiry,MRP,Qty\n' + 'x,1,06/28,9,1\n'.repeat(12_000))))
      .rejects.toThrow(/more than 10000 rows/);
    await expect(readStockFile(Buffer.from('\n'.repeat(4_000_000)))).rejects.toThrow();
  });
  it('many short rows do not overflow the call stack when the table is located', () => {
    const rows = [['Item Name', 'Batch', 'Expiry', 'MRP', 'Qty'], ...Array.from({ length: 200_000 }, () => ['x'])];
    expect(() => locateTable(rows)).toThrow(/more than 10000 rows/);   // a plain refusal, not a RangeError
  });
});
