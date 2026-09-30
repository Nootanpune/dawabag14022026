// src/services/productDetail.service.ts — the public product page
// Shows the buyer only their own price (trade prices are never exposed), the
// pre-packed goods declarations (C-17: MRP, net quantity, manufacturer name and
// address, country of origin, expiry of the batch that will be supplied), and
// product copy only after the pharmacist has approved it (C-19).
import { queryOne } from '../config/database';
import { cacheGet, cacheSet } from '../config/redis';
import { AppError } from '../utils/AppError';
import { BuyerType, priceField } from '../utils/customerType';

const PUBLIC_FIELDS = ['id', 'name', 'generic_name', 'sku', 'category', 'drug_schedule', 'hsn_code', 'gst_rate',
  'marketed_by', 'composition', 'storage_instructions', 'cold_chain', 'mrp_paise', 's3_image_key',
  'net_quantity', 'manufacturer_name', 'manufacturer_address', 'country_of_origin', 'max_qty_per_order'];

export async function productDetail(productId: string, pricingType: BuyerType) {
  const key = `product:${productId}`;
  let row: any = await cacheGet(key);
  if (!row) {
    row = await queryOne(
      `SELECT p.*,
              COALESCE(SUM(b.quantity_available - b.quantity_reserved), 0) AS stock_qty,
              MIN(b.expiry_date) AS nearest_expiry
       FROM products p
       LEFT JOIN inventory_batches b ON b.product_id = p.id
         AND b.expiry_date > CURRENT_DATE + 30 AND b.is_recalled = FALSE AND b.quantity_available > b.quantity_reserved
       WHERE p.id = $1 AND p.is_active = TRUE AND p.deleted_at IS NULL
       GROUP BY p.id`, [productId]);
    if (!row) throw new AppError('Product not found', 404);
    await cacheSet(key, row, 300);
  }

  const price = Number(row[priceField(pricingType)] ?? row.offer_price_paise);
  const out: Record<string, any> = Object.fromEntries(PUBLIC_FIELDS.map((f) => [f, row[f] ?? null]));
  return {
    ...out,
    description: row.content_status === 'approved' ? row.description : null,
    content_reviewed: row.content_status === 'approved',
    price_paise: price,
    offer_price_paise: price,   // kept for older clients
    stock_qty: Number(row.stock_qty),
    in_stock: Number(row.stock_qty) > 0,
    // FEFO: the earliest-expiring sellable batch is the one supplied (C-27)
    supplied_batch_expiry: row.nearest_expiry ? new Date(row.nearest_expiry).toISOString().slice(0, 7) : null,
    nearest_expiry: row.nearest_expiry,
    discount_pct: row.mrp_paise ? Math.round(((row.mrp_paise - price) / row.mrp_paise) * 100) : 0,
    requires_prescription: ['Schedule H', 'Schedule H1'].includes(row.drug_schedule),
    cannot_order_online: ['NDPS', 'Schedule X'].includes(row.drug_schedule),
  };
}
