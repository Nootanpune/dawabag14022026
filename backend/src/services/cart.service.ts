// src/services/cart.service.ts
// The server-side cart is the only cart (docs/DECISIONS.md: server is the single
// source of truth). It stores product + quantity; everything shown to the buyer
// (price for their type, stock, limits, Rx flag, coupon) is computed here live.
import { pool, query, queryOne, withTransaction } from '../config/database';
import { AppError } from '../utils/AppError';
import { BuyerType, priceField, requiresPrescription } from '../utils/customerType';
import { evaluateCoupon } from './coupon.service';

const BLOCKED_SCHEDULES = ['Schedule X', 'NDPS'];

export interface CartLine {
  product_id: string;
  name: string;
  sku: string;
  drug_schedule: string;
  cold_chain: boolean;
  image_key: string | null;
  quantity: number;
  unit_price_paise: number;
  mrp_paise: number;
  line_subtotal_paise: number;
  min_qty: number;
  max_qty: number;
  stock_qty: number;
  available: boolean;           // sellable and in stock for this quantity
  issue: string | null;         // why not, in buyer-readable words
  requires_prescription: boolean;
}

// Quantity limits per buyer type — same columns order.controller enforces
function qtyLimits(type: BuyerType, p: any): { min: number; max: number } {
  if (type === 'b2b_retailer') return { min: p.min_order_qty_retailer ?? 1, max: p.max_qty_per_order_retailer ?? 9999 };
  if (type === 'b2b_wholesaler') return { min: p.min_order_qty_wholesaler ?? 10, max: p.max_qty_per_order_wholesaler ?? 9999 };
  return { min: 1, max: p.max_qty_per_order };
}

async function productRows(productIds: string[]) {
  if (!productIds.length) return [];
  return query<any>(
    `SELECT p.id, p.name, p.sku, p.drug_schedule, p.cold_chain, p.s3_image_key,
            p.is_active, p.deleted_at, p.mrp_paise, p.offer_price_paise,
            COALESCE(p.ptr_price_paise, p.offer_price_paise) AS ptr_price_paise,
            COALESCE(p.pts_price_paise, p.offer_price_paise) AS pts_price_paise,
            COALESCE(p.institutional_price_paise, p.offer_price_paise) AS institutional_price_paise,
            p.max_qty_per_order, p.min_order_qty_retailer, p.min_order_qty_wholesaler,
            p.max_qty_per_order_retailer, p.max_qty_per_order_wholesaler,
            COALESCE(SUM(b.quantity_available - b.quantity_reserved)
              FILTER (WHERE b.expiry_date > CURRENT_DATE + 30 AND NOT b.is_recalled), 0)::int AS stock_qty
     FROM products p
     LEFT JOIN inventory_batches b ON b.product_id = p.id
     WHERE p.id = ANY($1::uuid[])
     GROUP BY p.id`,
    [productIds]
  );
}

export async function getCart(userId: string, pricingType: BuyerType) {
  const rows = await query<{ product_id: string; quantity: number }>(
    'SELECT product_id, quantity FROM cart_items WHERE user_id = $1 ORDER BY added_at',
    [userId]
  );
  const products = new Map((await productRows(rows.map((r) => r.product_id))).map((p) => [p.id, p]));
  const column = priceField(pricingType);

  const items: CartLine[] = rows.map((r) => {
    const p = products.get(r.product_id);
    const { min, max } = qtyLimits(pricingType, p);
    const unit = p[column] ?? p.offer_price_paise;
    let issue: string | null = null;
    if (!p.is_active || p.deleted_at || BLOCKED_SCHEDULES.includes(p.drug_schedule)) issue = 'No longer available';
    else if (p.stock_qty < r.quantity) issue = p.stock_qty > 0 ? `Only ${p.stock_qty} in stock` : 'Out of stock';
    else if (r.quantity < min) issue = `Minimum order is ${min}`;
    else if (r.quantity > max) issue = `Maximum per order is ${max}`;
    return {
      product_id: p.id, name: p.name, sku: p.sku, drug_schedule: p.drug_schedule,
      cold_chain: p.cold_chain, image_key: p.s3_image_key,
      quantity: r.quantity, unit_price_paise: unit, mrp_paise: p.mrp_paise,
      line_subtotal_paise: unit * r.quantity, min_qty: min, max_qty: max,
      stock_qty: p.stock_qty, available: issue === null, issue,
      requires_prescription: requiresPrescription(pricingType, p.drug_schedule),
    };
  });

  const subtotal = items.filter((i) => i.available).reduce((s, i) => s + i.line_subtotal_paise, 0);
  const cart = await queryOne<{ coupon_code: string | null }>('SELECT coupon_code FROM carts WHERE user_id = $1', [userId]);

  let coupon: { code: string; discount_paise: number; valid: boolean; message: string | null } | null = null;
  if (cart?.coupon_code) {
    try {
      const c = await evaluateCoupon(pool, cart.coupon_code, items.filter((i) => i.available));
      coupon = { code: c.code, discount_paise: c.discountPaise, valid: true, message: null };
    } catch (err) {
      coupon = { code: cart.coupon_code, discount_paise: 0, valid: false, message: (err as Error).message };
    }
  }

  return {
    items,
    coupon,
    pricing_type: pricingType,
    subtotal_paise: subtotal,
    discount_paise: coupon?.valid ? coupon.discount_paise : 0,
    requires_prescription: items.some((i) => i.available && i.requires_prescription),
    item_count: items.reduce((s, i) => s + i.quantity, 0),
  };
}

// Sets an absolute quantity; 0 removes the line.
export async function setCartItem(userId: string, productId: string, quantity: number): Promise<void> {
  if (quantity === 0) {
    await query('DELETE FROM cart_items WHERE user_id = $1 AND product_id = $2', [userId, productId]);
    return;
  }
  const [p] = await productRows([productId]);
  if (!p || !p.is_active || p.deleted_at) throw new AppError('Product not found', 404);
  if (BLOCKED_SCHEDULES.includes(p.drug_schedule)) throw new AppError(`${p.name} cannot be ordered online`, 403);

  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO carts (user_id) VALUES ($1) ON CONFLICT (user_id) DO UPDATE SET updated_at = NOW()`,
      [userId]
    );
    await client.query(
      `INSERT INTO cart_items (user_id, product_id, quantity) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, product_id) DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = NOW()`,
      [userId, productId, quantity]
    );
  });
}

// Applying a coupon validates it against the current cart first, so the buyer
// sees the reason at once; removing (null) always succeeds.
export async function setCartCoupon(userId: string, code: string | null, pricingType: BuyerType): Promise<void> {
  if (code) {
    const cart = await getCart(userId, pricingType);
    await evaluateCoupon(pool, code, cart.items.filter((i) => i.available));
  }
  await query(
    `INSERT INTO carts (user_id, coupon_code) VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET coupon_code = EXCLUDED.coupon_code, updated_at = NOW()`,
    [userId, code ? code.trim().toUpperCase() : null]
  );
}

export async function clearCart(userId: string): Promise<void> {
  await query('DELETE FROM cart_items WHERE user_id = $1', [userId]);
  await query('UPDATE carts SET coupon_code = NULL, updated_at = NOW() WHERE user_id = $1', [userId]);
}
