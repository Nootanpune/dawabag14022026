// src/services/productDetail.service.ts — the public product page
// Shows the buyer only their own price (trade prices are never exposed), the
// pre-packed goods declarations (C-17: MRP, net quantity, manufacturer name and
// address, country of origin, expiry of the batch that will be supplied), and
// product copy only after the pharmacist has approved it (C-19).
import { queryOne } from '../config/database';
import { cacheGet, cacheSet } from '../config/redis';
import { AppError } from '../utils/AppError';
import { BuyerType, priceField } from '../utils/customerType';
import { partnerNearestExpirySql, partnerStockSql } from './stock/partnerStock';
import { imageUrlFor } from './productImage.service';
import { qtyLimits } from './cart.service';
import { COLD_CHAIN_NOTE, expiryMonthLabel } from './productPage/deliveryEstimate';

const PUBLIC_FIELDS = ['id', 'name', 'generic_name', 'sku', 'category', 'drug_schedule', 'hsn_code', 'gst_rate',
  'marketed_by', 'composition', 'storage_instructions', 'cold_chain', 'mrp_paise', 's3_image_key',
  'net_quantity', 'manufacturer_name', 'manufacturer_address', 'country_of_origin', 'max_qty_per_order'];

export async function productDetail(productId: string, pricingType: BuyerType) {
  const key = `product:${productId}`;
  let row: any = await cacheGet(key);
  if (!row) {
    row = await queryOne(
      `SELECT p.*,
              -- the most one seller can supply: Dawabag's batches or one partner's own ledger
              GREATEST(COALESCE(SUM(b.quantity_available - b.quantity_reserved), 0), ${partnerStockSql('p.id')}) AS stock_qty,
              LEAST(MIN(b.expiry_date), ${partnerNearestExpirySql('p.id')}) AS nearest_expiry
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
    // The pack photo, like the copy, is shown only after pharmacist approval (C-19)
    image_url: row.content_status === 'approved' ? await imageUrlFor(row.s3_image_key) : null,
    price_paise: price,
    offer_price_paise: price,   // kept for older clients
    stock_qty: Number(row.stock_qty),
    in_stock: Number(row.stock_qty) > 0,
    // FEFO: the earliest-expiring sellable batch is the one supplied (C-27)
    supplied_batch_expiry: row.nearest_expiry ? new Date(row.nearest_expiry).toISOString().slice(0, 7) : null,
    nearest_expiry: row.nearest_expiry,
    // Sprint 33: "Expires on or after Mar 2027" — the earliest batch any seller would supply (FEFO, > 30 days left)
    expires_on_or_after: expiryMonthLabel(row.nearest_expiry ? new Date(row.nearest_expiry).toISOString() : null),
    // 2–8 °C products travel in an insulated pack (C-25)
    cold_chain_note: row.cold_chain ? COLD_CHAIN_NOTE : null,
    discount_pct: row.mrp_paise ? Math.round(((row.mrp_paise - price) / row.mrp_paise) * 100) : 0,
    requires_prescription: ['Schedule H', 'Schedule H1'].includes(row.drug_schedule),
    // This buyer's own order limits, as the cart applies them (Sprint 26: quantity before Add)
    min_order_qty: qtyLimits(pricingType, row).min,
    max_order_qty: qtyLimits(pricingType, row).max,
    cannot_order_online: ['NDPS', 'Schedule X'].includes(row.drug_schedule),
  };
}
