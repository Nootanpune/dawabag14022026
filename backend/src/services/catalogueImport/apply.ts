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
import { getSetting } from '../settings.service';
import { assertBelowShelfMrp } from '../shelfMrp';
import { parseCatalogueWorkbook } from './parse';
import { BatchRecord, Checked, ProductRecord, checkBatch, checkProduct } from './validate';
import { assertBatchReceivable } from '../recallAlerts/receiptGate';
import { categoryKey } from '../catalogueLists/rules';

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

  // Sprint 34: a category / HSN code an admin switched off is refused for a new product or
  // a product moving to it (one that already had it keeps it) — same rule as the forms and
  // the database trigger, with a plain reason on the row (C-46 lists are managed by admins)
  const off = await switchedOffEntries(client);
  for (const p of checkedP) {
    if (!p.record) continue;
    const cur: any = existing.get(p.sku);
    p.errors.push(...switchedOffProblems(p.record, cur ?? null, off));
  }

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

export interface SwitchedOff { categories: Map<string, string>; hsn: Set<string> }

async function switchedOffEntries(client: PoolClient): Promise<SwitchedOff> {
  const cats = (await client.query(`SELECT name_key, name FROM product_categories WHERE NOT is_active`)).rows;
  const hsn = (await client.query(`SELECT code FROM hsn_codes WHERE NOT is_active`)).rows;
  return { categories: new Map(cats.map((r: any) => [r.name_key, r.name])), hsn: new Set(hsn.map((r: any) => r.code)) };
}

/** Plain reasons a row cannot use a switched-off category / HSN code (pure; unit-tested). */
export function switchedOffProblems(rec: Pick<ProductRecord, 'category' | 'hsn_code'>,
  cur: { category?: string | null; hsn_code?: string | null } | null, off: SwitchedOff): string[] {
  const out: string[] = [];
  const key = categoryKey(rec.category);
  if (off.categories.has(key) && (!cur?.category || categoryKey(cur.category) !== key)) {
    out.push(`Category "${off.categories.get(key)}" is switched off in Admin → Catalogue lists; choose another category or ask an admin to switch it back on`);
  }
  const hsn = rec.hsn_code?.trim();
  if (hsn && off.hsn.has(hsn) && (cur?.hsn_code ?? '').trim() !== hsn) {
    out.push(`HSN code ${hsn} is switched off in Admin → Catalogue lists; choose another code or ask an admin to switch it back on`);
  }
  return out;
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
        await assertBelowShelfMrp(cur.id, { ...cur, ...fields }, client);
        const copyChanged = COPY.some((k) => (fields as any)[k] !== cur[k]);
        const all: Record<string, unknown> = copyChanged
          ? { ...fields, content_status: 'pending_review', content_flags: JSON.stringify(copyFlags({ ...cur, ...fields })) } : fields;
        const keys = Object.keys(all);
        await client.query(`UPDATE products SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')}, updated_at = NOW() WHERE id = $1`,
          [cur.id, ...Object.values(all)]);
        await cacheDel(`product:${cur.id}`);
      }
    }
    // Opening stock is for go-live only; afterwards stock enters through goods receipts (C-02, C-16, C-46)
    const opening = p.batches.filter((r) => r.record && r.action !== 'error');
    if (opening.length && (await getSetting('catalogue.opening_stock_open', true, client)) !== true) {
      throw new AppError('Opening stock is closed: receive stock with a goods receipt against a purchase order', 409);
    }
    const created: unknown[] = [];
    for (const row of p.batches) {
      if (!row.record || row.action === 'error') continue;
      const b = row.record;
      const productId = ids.get(b.sku) ?? (await client.query(`SELECT id FROM products WHERE upper(sku) = $1`, [b.sku])).rows[0]?.id;
      await assertBatchReceivable(client, productId, b.batch_number, b.sku);   // C-28
      await client.query(
        `INSERT INTO inventory_batches (product_id, batch_number, quantity_available, purchase_price_paise, expiry_date,
           manufactured_date, storage_location)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [productId, b.batch_number, b.quantity, b.purchase_price_paise, b.expiry_date, b.manufactured_date, b.storage_location]);
      created.push({ sku: b.sku, batch: b.batch_number, quantity: b.quantity, cost_paise: b.purchase_price_paise, expiry: b.expiry_date });
    }
    // Every opening-stock batch is named in the audit, not just counted (C-46)
    await writeAuditTx(client, { userId: null, action: 'catalogue_imported', performedBy: adminId, newValue: { ...s, skip_errors: skipErrors, opening_stock: created } });
    return { summary: s };
  });
}
