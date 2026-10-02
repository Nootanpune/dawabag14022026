// Small product cards for the cart's "Buy again" and "Cheaper option" rows
// (Sprint 25). Same listing rules as the catalogue search: only active, not
// deleted products, never Schedule X / NDPS (C-10); the buyer's own price for
// their type; stock is the most one seller can supply (own sellable batches or one
// partner's ledger); the pack photo only once a pharmacist approved it (C-19).
import { query } from '../../config/database';
import { BuyerType, requiresPrescription } from '../../utils/customerType';
import { partnerStockSql } from '../stock/partnerStock';
import { approvedImageKeySql, withImageUrls } from '../productImage.service';
import { buyerColumns } from '../search/productSearch.service';

export interface ProductCard {
  id: string;
  name: string;
  generic_name: string | null;
  sku: string;
  category: string | null;
  drug_schedule: string;
  mrp_paise: number;
  display_price_paise: number;
  min_order_qty: number;
  stock_qty: number;
  in_stock: boolean;
  requires_prescription: boolean;
  image_url: string | null;
}

/** Conditions every card must meet (alias p). */
export const SELLABLE_SQL =
  `p.is_active = TRUE AND p.deleted_at IS NULL AND COALESCE(p.drug_schedule, '') NOT IN ('Schedule X', 'NDPS')`;

/** Stock one seller can supply right now (alias p). Same rule as search and cart. */
export const stockQtySql = () =>
  `GREATEST((SELECT COALESCE(SUM(b.quantity_available - b.quantity_reserved), 0) FROM inventory_batches b
     WHERE b.product_id = p.id AND b.expiry_date > CURRENT_DATE + 30 AND b.is_recalled = FALSE), ${partnerStockSql('p.id')})`;

/** Card columns for the buyer type (alias p). */
export function cardColumnsSql(pricingType: string) {
  const { displayPrice, minQty } = buyerColumns(pricingType);
  return `p.id, p.name, p.generic_name, p.sku, p.category, p.drug_schedule, p.mrp_paise,
          (${displayPrice})::int AS display_price_paise, (${minQty})::int AS min_order_qty,
          ${approvedImageKeySql()} AS approved_image_key, (${stockQtySql()})::int AS stock_qty`;
}

/** Turns rows selected with cardColumnsSql into cards (signed photo links). */
export async function toCards(rows: any[], pricingType: BuyerType): Promise<ProductCard[]> {
  const withUrls = await withImageUrls(rows, 'approved_image_key');
  return withUrls.map((r: any) => ({
    id: r.id,
    name: r.name,
    generic_name: r.generic_name,
    sku: r.sku,
    category: r.category,
    drug_schedule: r.drug_schedule,
    mrp_paise: Number(r.mrp_paise),
    display_price_paise: Number(r.display_price_paise),
    min_order_qty: Number(r.min_order_qty),
    stock_qty: Number(r.stock_qty),
    in_stock: Number(r.stock_qty) > 0,
    requires_prescription: requiresPrescription(pricingType, r.drug_schedule),
    image_url: r.image_url ?? null,
  }));
}

export async function cardsByIds(ids: string[], pricingType: BuyerType): Promise<ProductCard[]> {
  if (!ids.length) return [];
  const rows = await query<any>(
    `SELECT ${cardColumnsSql(pricingType)} FROM products p WHERE p.id = ANY($1::uuid[]) AND ${SELLABLE_SQL}`, [ids]);
  const byId = new Map(rows.map((r) => [r.id, r]));
  return toCards(ids.map((id) => byId.get(id)).filter(Boolean), pricingType);
}
