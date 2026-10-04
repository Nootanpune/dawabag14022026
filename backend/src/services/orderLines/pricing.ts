// One order line priced for a buyer — shared by order placement and by lines a buyer adds
// before the invoice (Sprint 44, services/orderEdit), so both apply the same rules:
// Schedule X / NDPS never online, only products a pharmacist allowed for online sale (C-10),
// the buyer type's minimum / maximum per order, and the buyer type's price (URS v3.1); and
// Sprint 47: who may buy the product (doctors and hospitals only / licensed trade buyers only).
import { PoolClient } from 'pg';
import { AppError } from '../../utils/AppError';
import { BuyerType, priceField, requiresPrescription } from '../../utils/customerType';
import { notOnlineMessage } from '../onlineSale/rules';
import { BUYER_RESTRICTED, buyerMay, restrictedMessage } from '../buyerRestriction/rules';
import type { Standing } from '../buyerRestriction/standing.service';
import { PricedLine } from '../shipment.service';

export interface OrderLinePrice extends PricedLine {
  drug_schedule: string;
  reorder_level_qty: number;
  /** this buyer needs a prescription for it (C-08) */
  needs_prescription: boolean;
  min_qty: number;
  max_qty: number;
}

export interface SellableProduct {
  id: string; name: string; sku: string; drug_schedule: string; gst_rate: number; mrp_paise: number; cold_chain: boolean;
  reorder_level_qty: number; unit_price_paise: number; min_qty: number; max_qty: number; needs_prescription: boolean;
}

/** A product as this buyer may buy it online, or a plain refusal (404 / 403 NOT_FOR_ONLINE_SALE / 403 BUYER_RESTRICTED). */
export async function sellableProduct(client: PoolClient, productId: string, customerType: BuyerType, buyer: Standing): Promise<SellableProduct> {
  const prod = (await client.query(
    `SELECT p.id, p.name, p.sku, p.drug_schedule, p.gst_rate,
            p.mrp_paise, p.offer_price_paise,
            COALESCE(p.ptr_price_paise, p.offer_price_paise) AS ptr_price_paise,
            COALESCE(p.pts_price_paise, p.offer_price_paise) AS pts_price_paise,
            COALESCE(p.institutional_price_paise, p.offer_price_paise) AS institutional_price_paise,
            p.max_qty_per_order,
            COALESCE(p.min_order_qty_retailer, 1) AS min_order_qty_retailer,
            COALESCE(p.min_order_qty_wholesaler, 10) AS min_order_qty_wholesaler,
            COALESCE(p.max_qty_per_order_retailer, 9999) AS max_qty_per_order_retailer,
            COALESCE(p.max_qty_per_order_wholesaler, 9999) AS max_qty_per_order_wholesaler,
            p.is_active, p.cold_chain, p.online_sale_status, p.buyer_restriction,
            COALESCE(p.reorder_level_qty, 10) AS reorder_level_qty
     FROM products p
     WHERE p.id = $1 AND p.is_active = TRUE AND p.deleted_at IS NULL`, [productId])).rows[0];
  if (!prod) throw new AppError(`Product not found: ${productId}`, 404);
  // Hard block NDPS/Schedule X
  if (['NDPS', 'Schedule X'].includes(prod.drug_schedule)) throw new AppError(`${prod.name} cannot be ordered online`, 403);
  // Sprint 39: only products a pharmacist allowed for online sale (C-10) — also stops
  // every partner's sale of a product switched off by a notification
  if (prod.online_sale_status !== 'permitted') {
    throw new AppError(notOnlineMessage(prod.name, prod.online_sale_status), 403, true, 'NOT_FOR_ONLINE_SALE');
  }
  // Sprint 47: a product a pharmacist restricted to verified doctors / hospitals (r.65(9)(b)) or to
  // licensed trade buyers (C-14, C-33) — whoever the seller (Dawabag or a partner)
  if (!buyerMay(prod.buyer_restriction, buyer)) {
    throw new AppError(restrictedMessage(prod.name, prod.buyer_restriction, buyer.kind), 403, true, BUYER_RESTRICTED);
  }
  let minQty = 1;
  let maxQty = prod.max_qty_per_order;
  if (customerType === 'b2b_retailer') { minQty = prod.min_order_qty_retailer; maxQty = prod.max_qty_per_order_retailer; }
  else if (customerType === 'b2b_wholesaler') { minQty = prod.min_order_qty_wholesaler; maxQty = prod.max_qty_per_order_wholesaler; }
  return {
    id: prod.id, name: prod.name, sku: prod.sku, drug_schedule: prod.drug_schedule, gst_rate: prod.gst_rate, mrp_paise: prod.mrp_paise,
    cold_chain: prod.cold_chain, reorder_level_qty: prod.reorder_level_qty,
    unit_price_paise: prod[priceField(customerType)] || prod.offer_price_paise,
    min_qty: Number(minQty), max_qty: maxQty == null ? 9999 : Number(maxQty),
    needs_prescription: requiresPrescription(customerType, prod.drug_schedule),
  };
}

/** Refuses a quantity outside the buyer type's minimum / maximum per order. */
export function assertQuantity(p: Pick<SellableProduct, 'name' | 'min_qty' | 'max_qty'>, quantity: number) {
  if (quantity < p.min_qty) throw new AppError(`Minimum order for ${p.name} is ${p.min_qty} units`, 400);
  if (quantity > p.max_qty) throw new AppError(`Maximum order for ${p.name} is ${p.max_qty} units`, 400);
}

/** A priced line for a quantity (unit price: this buyer's price now, unless given — e.g. a raised line keeps its price). */
export function pricedLine(p: SellableProduct, quantity: number, unitPricePaise = p.unit_price_paise): OrderLinePrice {
  const assessable = unitPricePaise * quantity;
  const gst = Math.round(assessable * p.gst_rate / 100);
  return {
    product_id: p.id, product_name: p.name, sku: p.sku, cold_chain: p.cold_chain, reorder_level_qty: p.reorder_level_qty,
    quantity, unit_price_paise: unitPricePaise, mrp_paise: p.mrp_paise, gst_rate: p.gst_rate,
    gst_amount_paise: gst, assessable_paise: assessable, line_total_paise: assessable + gst,
    drug_schedule: p.drug_schedule, needs_prescription: p.needs_prescription, min_qty: p.min_qty, max_qty: p.max_qty,
  };
}

/** Order placement: one requested line, checked and priced (C-10, URS v3.1 quantity limits). */
export async function priceOrderLine(client: PoolClient, item: { product_id: string; quantity: number }, customerType: BuyerType,
  buyer: Standing): Promise<OrderLinePrice> {
  const p = await sellableProduct(client, item.product_id, customerType, buyer);
  assertQuantity(p, item.quantity);
  return pricedLine(p, item.quantity);
}
