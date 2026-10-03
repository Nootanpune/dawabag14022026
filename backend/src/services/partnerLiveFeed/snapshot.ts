// Sprint 37 — the live stock snapshot a partner's connector sends as JSON (contract:
// docs/partner-stock-api.md §6). Turned into the same table the file upload produces,
// with fixed columns, so it runs through the ONE import pipeline (insertImportTx →
// evaluateImport: matching, expiry / MRP / recall checks). Pure: unit-tested.
import crypto from 'crypto';
import { z } from 'zod';
import { AppError } from '../../utils/AppError';
import { FIELD_KEYS, FieldKey, Mapping } from '../partnerStockImport/fields';
import type { PreparedImport } from '../partnerStockImport/import.service';
import { MAX_DATA_ROWS } from '../partnerStockImport/readFile';

/** Money and quantities may be sent as numbers or as the software prints them ("1,234.50"). */
const amount = z.union([z.number().finite(), z.string().trim().max(30)]);
const text = (max: number) => z.string().trim().max(max);

export const snapshotItemSchema = z.object({
  item_code: text(100).nullish(),
  item_name: text(500).min(1, 'item_name is empty'),
  pack: text(100).nullish(),
  manufacturer: text(255).nullish(),
  hsn: text(20).nullish(),
  batch: text(100).min(1, 'batch is empty'),
  expiry: text(20).min(1, 'expiry is empty'),
  mrp: amount,
  ptr: amount.nullish(),
  rate: amount.nullish(),
  purchase_rate: amount.nullish(),
  quantity: amount,
  free_quantity: amount.nullish(),
  gst_rate: amount.nullish(),
}).strict();

export const snapshotSchema = z.object({
  /** Increases with every snapshot the connector sends (never reused) */
  sequence: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  /** When the connector read the stock from the software, with its UTC offset */
  taken_at: z.string().datetime({ offset: true }),
  /** Must be true: the snapshot lists ALL of the partner's stock (what is absent is 0) */
  complete: z.literal(true, { errorMap: () => ({ message: 'complete must be true: send the whole stock every time' }) }),
  source: text(100).optional(),
  items: z.array(snapshotItemSchema).min(1, 'items is empty: a full snapshot always has stock lines')
    .max(MAX_DATA_ROWS, `at most ${MAX_DATA_ROWS} lines in one snapshot`),
}).strict();

export type Snapshot = z.infer<typeof snapshotSchema>;
export type SnapshotItem = z.infer<typeof snapshotItemSchema>;

/** Column order of the table a snapshot becomes (JSON field → import field). */
export const SNAPSHOT_COLUMNS: { json: keyof SnapshotItem; field: FieldKey; header: string }[] = [
  { json: 'item_code', field: 'item_code', header: 'Item code' },
  { json: 'item_name', field: 'item_name', header: 'Item name' },
  { json: 'pack', field: 'pack', header: 'Pack' },
  { json: 'manufacturer', field: 'manufacturer', header: 'Manufacturer' },
  { json: 'hsn', field: 'hsn', header: 'HSN' },
  { json: 'batch', field: 'batch_number', header: 'Batch no' },
  { json: 'expiry', field: 'expiry', header: 'Expiry' },
  { json: 'mrp', field: 'mrp', header: 'MRP' },
  { json: 'ptr', field: 'ptr', header: 'PTR' },
  { json: 'rate', field: 'sale_rate', header: 'Sale rate' },
  { json: 'purchase_rate', field: 'purchase_rate', header: 'Purchase rate' },
  { json: 'quantity', field: 'quantity', header: 'Qty' },
  { json: 'free_quantity', field: 'free_quantity', header: 'Free qty' },
  { json: 'gst_rate', field: 'gst_rate', header: 'GST%' },
];

export const SNAPSHOT_MAPPING: Mapping = Object.fromEntries(FIELD_KEYS.map((f) => {
  const i = SNAPSHOT_COLUMNS.findIndex((c) => c.field === f);
  return [f, i < 0 ? null : i];
}));

/** Plain words for the first problem zod found, with where it is ("items[3].expiry"). */
export function snapshotProblem(err: z.ZodError): string {
  const issue = err.issues[0];
  const where = issue.path.map((p) => (typeof p === 'number' ? `[${p}]` : `.${p}`)).join('').replace(/^\./, '');
  return `Snapshot not accepted: ${where ? `${where}: ` : ''}${issue.message}`;
}

export function parseSnapshot(body: unknown): Snapshot {
  const r = snapshotSchema.safeParse(body);
  if (!r.success) throw new AppError(snapshotProblem(r.error), 422);
  return r.data;
}

/** Fingerprint of the stock lines (not the sequence or time): the same stock gives the same value. */
export function snapshotSha256(items: SnapshotItem[]): string {
  const canonical = items.map((it) => SNAPSHOT_COLUMNS.map((c) => (it[c.json] ?? null)));
  return crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

const cellText = (v: unknown) => (v === null || v === undefined ? '' : String(v));

/** The snapshot as an import table: fixed columns, confirmed mapping, one row per line. */
export function snapshotToImport(s: Snapshot, bytes: number): PreparedImport {
  return {
    fileName: `live snapshot #${s.sequence}`,
    size: bytes,
    sha256: snapshotSha256(s.items),
    kind: 'json',
    sheetName: null,
    software: s.source?.slice(0, 100) || 'Live connector',
    headerRow: 1,
    headers: SNAPSHOT_COLUMNS.map((c) => c.header),
    rows: s.items.map((it, i) => ({ rowNumber: i + 2, cells: SNAPSHOT_COLUMNS.map((c) => cellText(it[c.json])) })),
    mapping: SNAPSHOT_MAPPING,
    mappingSource: 'confirmed',
  };
}
