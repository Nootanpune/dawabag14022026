// Preview and commit of a catalogue workbook. Commit runs in one transaction:
// either the whole file is applied or nothing is. Products are matched by SKU
// (create or update); opening-stock batches are new rows only. Changed product
// copy goes back to the pharmacist (C-19). Every change is audited (C-46).
import { PoolClient } from 'pg';
import { withTransaction } from '../../config/database';
import { cacheDel } from '../../config/redis';
import { AppError } from '../../utils/AppError';
import { writeAuditTx } from '../../utils/audit';
import { copyFlags } from '../productContent.service';
import { parseCatalogueWorkbook } from './parse';
import { BatchRecord, Checked, ProductRecord, checkBatch, checkProduct } from './validate';

const COPY = ['name', 'description', 'composition', 'storage_instructions'] as const;

interface Plan {
  products: (Checked<ProductRecord> & { action: 'create' | 'update' | 'unchanged' | 'error' })[];
  batches: (Checked<BatchRecord> & { action: 'create' | 'error' })[];
}

async function plan(client: PoolClient, buffer: Buffer): Promise<Plan> {
  const { products, batches } = await parseCatalogueWorkbook(buffer);
  if (products.length + batches.length > 5000) throw new AppError('Up to 5,000 rows per file', 422);
  const checkedP = products.map(checkProduct);
  const seen = new Map<string, number>();
  for (const p of checkedP) {
    if (!p.sku) continue;
    if (seen.has(p.sku)) p.errors.push(`SKU repeats row ${seen.get(p.sku)}`);
    else seen.set(p.sku, p.row);
  }
  const skus = [...new Set([...checkedP.map((p) => p.sku), ...batches.map((b) => String(b.sku ?? '').trim().toUpperCase())])].filter(Boolean);
  const existing = new Map((await client.query(
    `SELECT * FROM products WHERE upper(sku) = ANY($1::text[]) AND deleted_at IS NULL`, [skus])).rows.map((r: any) => [r.sku.toUpperCase(), r]));

  const outP: Plan['products'] = checkedP.map((p) => {
    if (p.errors.length || !p.record) return { ...p, record: null, action: 'error' as const };
    const cur: any = existing.get(p.sku);
    if (!cur) return { ...p, action: 'create' as const };
    const changed = Object.entries(p.record).some(([k, v]) => k !== 'sku' && k in cur && (cur[k] ?? null) !== (v ?? null));
    return { ...p, action: changed ? 'update' as const : 'unchanged' as const };
  });

  const known = new Set([...existing.keys(), ...outP.filter((p) => p.action !== 'error').map((p) => p.sku)]);
  const dupBatch = new Set((await client.query(
    `SELECT upper(p.sku) || '|' || b.batch_number AS k FROM inventory_batches b JOIN products p ON p.id = b.product_id
     WHERE upper(p.sku) = ANY($1::text[])`, [skus])).rows.map((r: any) => r.k));
  const inFile = new Set<string>();
  const outB: Plan['batches'] = batches.map((r) => {
    const b = checkBatch(r);
    if (b.record) {
      const key = `${b.sku}|${b.record.batch_number}`;
      if (!known.has(b.sku)) b.errors.push('SKU is not in the catalogue or in this file');
      if (dupBatch.has(key)) b.errors.push('This batch is already in stock; adjust it from inventory instead');
      if (inFile.has(key)) b.errors.push('Batch repeats in this file');
      inFile.add(key);
      const prod = outP.find((p) => p.sku === b.sku)?.record;
      if (prod && b.record.cold_chain !== prod.cold_chain) b.warnings.push('Cold-chain flag differs from the product');
    }
    return { ...b, record: b.errors.length ? null : b.record, action: b.errors.length ? 'error' as const : 'create' as const };
  });
  return { products: outP, batches: outB };
}

function summary(p: Plan) {
  const count = (rows: { action: string }[], a: string) => rows.filter((r) => r.action === a).length;
  return {
    products: { create: count(p.products, 'create'), update: count(p.products, 'update'), unchanged: count(p.products, 'unchanged'), error: count(p.products, 'error') },
    batches: { create: count(p.batches, 'create'), error: count(p.batches, 'error') },
  };
}

export async function previewCatalogue(buffer: Buffer) {
  return withTransaction(async (client) => {
    const p = await plan(client, buffer);
    return { summary: summary(p), products: p.products, batches: p.batches };
  });
}

export async function commitCatalogue(adminId: string, buffer: Buffer, skipErrors: boolean) {
  return withTransaction(async (client) => {
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('catalogue_import'))`);
    const p = await plan(client, buffer);
    const s = summary(p);
    if (!skipErrors && (s.products.error || s.batches.error)) {
      throw new AppError(`The file has ${s.products.error + s.batches.error} row(s) with errors; fix them or import without those rows`, 422);
    }
    const ids = new Map<string, string>();
    for (const row of p.products) {
      if (!row.record || row.action === 'error') continue;
      const rec = row.record;
      if (row.action === 'create') {
        const cols = Object.keys(rec);
        const r = (await client.query(
          `INSERT INTO products (${cols.join(', ')}, content_status, content_flags)
           VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}, 'pending_review', $${cols.length + 1}) RETURNING id`,
          [...Object.values(rec), JSON.stringify(copyFlags(rec))])).rows[0];
        ids.set(rec.sku, r.id);
      } else {
        const cur = (await client.query(`SELECT * FROM products WHERE upper(sku) = $1 FOR UPDATE`, [rec.sku])).rows[0];
        ids.set(rec.sku, cur.id);
        if (row.action === 'unchanged') continue;
        const { sku, ...fields } = rec;
        const copyChanged = COPY.some((k) => (fields as any)[k] !== cur[k]);
        const all: Record<string, unknown> = copyChanged
          ? { ...fields, content_status: 'pending_review', content_flags: JSON.stringify(copyFlags({ ...cur, ...fields })) } : fields;
        const keys = Object.keys(all);
        await client.query(`UPDATE products SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')}, updated_at = NOW() WHERE id = $1`,
          [cur.id, ...Object.values(all)]);
        await cacheDel(`product:${cur.id}`);
      }
    }
    for (const row of p.batches) {
      if (!row.record || row.action === 'error') continue;
      const b = row.record;
      const productId = ids.get(b.sku) ?? (await client.query(`SELECT id FROM products WHERE upper(sku) = $1`, [b.sku])).rows[0]?.id;
      await client.query(
        `INSERT INTO inventory_batches (product_id, batch_number, quantity_available, purchase_price_paise, expiry_date,
           manufactured_date, storage_location)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [productId, b.batch_number, b.quantity, b.purchase_price_paise, b.expiry_date, b.manufactured_date, b.storage_location]);
    }
    await writeAuditTx(client, { userId: null, action: 'catalogue_imported', performedBy: adminId, newValue: { ...s, skip_errors: skipErrors } });
    return { summary: s };
  });
}
