import { prepareRows } from '../partnerStockImport/rows';
import { parseSnapshot, SNAPSHOT_MAPPING, snapshotSha256, snapshotToImport } from './snapshot';

// Made-up items (no real stock)
const item = (over: Record<string, unknown> = {}) => ({
  item_code: 'S37-001', item_name: 'S37 TESTOMOL 500MG TAB', pack: '10 TAB', manufacturer: 'S37R', batch: 'b-1',
  expiry: '2028-05', mrp: 30, rate: '26.00', quantity: 12, free_quantity: 2, gst_rate: 12, ...over,
});
const snap = (over: Record<string, unknown> = {}) => ({ sequence: 5, taken_at: '2026-10-03T15:30:00+05:30', complete: true, items: [item()], ...over });

describe('live snapshot JSON (Sprint 37)', () => {
  it('accepts the documented shape', () => {
    const s = parseSnapshot(snap());
    expect(s.items[0].batch).toBe('b-1');
  });
  it('refuses a partial snapshot, an empty one and unknown fields, saying where', () => {
    expect(() => parseSnapshot(snap({ complete: false }))).toThrow(/complete must be true/);
    expect(() => parseSnapshot(snap({ items: [] }))).toThrow(/items is empty/);
    expect(() => parseSnapshot(snap({ items: [item({ qty: 3 })] }))).toThrow(/items\[0\]/);
    expect(() => parseSnapshot(snap({ items: [item({ batch: '' })] }))).toThrow(/items\[0\]\.batch/);
    expect(() => parseSnapshot(snap({ taken_at: 'yesterday' }))).toThrow(/taken_at/);
    expect(() => parseSnapshot(snap({ sequence: 0 }))).toThrow(/sequence/);
  });
  it('becomes the same table the file import reads (fixed, confirmed columns)', () => {
    const prep = snapshotToImport(parseSnapshot(snap()), 100);
    expect(prep.mappingSource).toBe('confirmed');
    expect(prep.kind).toBe('json');
    const [row] = prepareRows(prep.rows, SNAPSHOT_MAPPING);
    expect(row.skip).toBeNull();
    expect(row.parsed).toMatchObject({ item_code: 'S37-001', batch_number: 'B-1', expiry_date: '2028-05-31', mrp_paise: 3000,
      sale_rate_paise: 2600, quantity: 12, free_quantity: 2, total_quantity: 14, gst_rate: 12 });
    expect(row.itemKey).toBe('code:S37-001');
  });
  it('the fingerprint depends on the stock lines only', () => {
    const a = parseSnapshot(snap());
    const b = parseSnapshot(snap({ sequence: 6, taken_at: '2026-10-03T15:31:00+05:30' }));
    const c = parseSnapshot(snap({ items: [item({ quantity: 11 })] }));
    expect(snapshotSha256(a.items)).toBe(snapshotSha256(b.items));
    expect(snapshotSha256(a.items)).not.toBe(snapshotSha256(c.items));
  });
});
