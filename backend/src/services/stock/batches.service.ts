// Stock on hand by batch, with expiry status — replaces the old /inventory list
import { query } from '../../config/database';
import { getSetting } from '../settings.service';

export async function listBatches(f: { q?: string; product_id?: string; vendor_id?: string; recalled?: boolean; expiry?: 'expired' | 'near' | 'ok'; page: number; limit: number }) {
  const near = Number(await getSetting('stock.near_expiry_days', 90));
  const where = ['1=1'];
  const params: unknown[] = [];
  if (f.product_id) { params.push(f.product_id); where.push(`b.product_id = $${params.length}`); }
  // Picking stock for a purchase return: this supplier's batches, or recalled ones (C-28)
  if (f.vendor_id) { params.push(f.vendor_id); where.push(`b.vendor_id = $${params.length}`); }
  if (f.recalled) where.push('b.is_recalled AND b.quantity_available > 0');
  if (f.q) { params.push(`%${f.q}%`); where.push(`(p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length} OR b.batch_number ILIKE $${params.length})`); }
  if (f.expiry === 'expired') where.push('b.expiry_date <= CURRENT_DATE AND b.quantity_available > 0');
  if (f.expiry === 'near') { params.push(near); where.push(`b.expiry_date > CURRENT_DATE AND b.expiry_date <= CURRENT_DATE + $${params.length}::int AND b.quantity_available > 0`); }
  if (f.expiry === 'ok') { params.push(near); where.push(`b.expiry_date > CURRENT_DATE + $${params.length}::int`); }
  const total = (await query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM inventory_batches b JOIN products p ON p.id = b.product_id WHERE ${where.join(' AND ')}`, params))[0].n;
  params.push(f.limit, (f.page - 1) * f.limit);
  const batches = await query(
    `SELECT b.id, b.batch_number, b.expiry_date, b.quantity_available, b.quantity_reserved, b.purchase_price_paise, b.printed_mrp_paise,
            b.storage_location, b.is_recalled, p.id AS product_id, p.name AS product_name, p.sku, p.drug_schedule, p.cold_chain,
            b.vendor_id, v.name AS supplier_name, (b.expiry_date - CURRENT_DATE) AS days_to_expiry
     FROM inventory_batches b JOIN products p ON p.id = b.product_id LEFT JOIN vendors v ON v.id = b.vendor_id
     WHERE ${where.join(' AND ')} ORDER BY b.expiry_date, p.name
     LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  return { batches, total };
}
