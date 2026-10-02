// src/services/productDetail.service.ts — the public product page
// Shows the buyer only their own price (trade prices are never exposed), the
// pre-packed goods declarations (C-17: MRP, net quantity, manufacturer name and
// address, country of origin, expiry of the batch that will be supplied), and
// product copy only after the pharmacist has approved it (C-19).
import { queryOne } from '../config/database';
import { cacheGet, cacheSet } from '../config/redis';
import { AppError } from '../utils/AppError';
import { BuyerType, priceField } from '../utils/customerType';
import { ownNearestExpirySql, partnerNearestExpirySql, sellableStockSql } from './stock/partnerStock';
import { saleKindFor } from './stock/sellingRights';
import { imageUrlFor } from './productImage.service';
import { qtyLimits } from './cart.service';

const PUBLIC_FIELDS = ['id', 'name', 'generic_name', 'sku', 'category', 'drug_schedule', 'hsn_code', 'gst_rate',
  'marketed_by', 'composition', 'storage_instructions', 'cold_chain', 'mrp_paise', 's3_image_key',
  'net_quantity', 'manufacturer_name', 'manufacturer_address', 'country_of_origin', 'max_qty_per_order'];

export async function productDetail(productId: string, pricingType: BuyerType) {
  const key = `product:${productId}`;
  let row: any = await cacheGet(key);
  if (!row) {
    row = await queryOne(`SELECT p.* FROM products p WHERE p.id = $1 AND p.is_active = TRUE AND p.deleted_at IS NULL`, [productId]);
    if (!row) throw new AppError('Product not found', 404);
    await cacheSet(key, row, 300);
  }
  // Stock is read live for THIS buyer's kind of sale (not cached): the most one seller
  // licensed to sell to them can supply — Dawabag's batches or one partner's own
  // ledger — the same rule as search, cart and allocation (Sprint 32, C-33, C-07)
  const kind = saleKindFor(pricingType);
  const stock = await queryOne<{ stock_qty: number; nearest_expiry: string | null }>(
    `SELECT (${sellableStockSql('$1::uuid', kind)})::int AS stock_qty,
            LEAST(${ownNearestExpirySql('$1::uuid', kind)}, ${partnerNearestExpirySql('$1::uuid', kind)}) AS nearest_expiry`,
    [productId]);
  row = { ...row, stock_qty: stock?.stock_qty ?? 0, nearest_expiry: stock?.nearest_expiry ?? null };

  const price = Number(row[priceField(pricingType)] ?? row.offer_price_paise);
  const out: Record<string, any> = Object.fromEntries(PUBLIC_FIELDS.map((f) => [f, row[f] ?? null]));
  return {
    ...out,
    description: row.content_status === 'approved' ? row.description : null,
    content_reviewed: row.content_status === 'approved',
    // The pack photo, like the copy, is shown only after pharmacist approval (C-19)
    image_url: row.content_status === 'approved' ? await imageUrlFor(row.s3_image_key) : null,
    price_paise: price,
    offer_price_paise: price,   // kept for older clients
    stock_qty: Number(row.stock_qty),
    in_stock: Number(row.stock_qty) > 0,
    // FEFO: the earliest-expiring sellable batch is the one supplied (C-27)
    supplied_batch_expiry: row.nearest_expiry ? new Date(row.nearest_expiry).toISOString().slice(0, 7) : null,
    nearest_expiry: row.nearest_expiry,
    discount_pct: row.mrp_paise ? Math.round(((row.mrp_paise - price) / row.mrp_paise) * 100) : 0,
    requires_prescription: ['Schedule H', 'Schedule H1'].includes(row.drug_schedule),
    // This buyer's own order limits, as the cart applies them (Sprint 26: quantity before Add)
    min_order_qty: qtyLimits(pricingType, row).min,
    max_order_qty: qtyLimits(pricingType, row).max,
    cannot_order_online: ['NDPS', 'Schedule X'].includes(row.drug_schedule),
  };
}
