// "Cheaper option with the same medicine" for each cart line (Sprint 25). Only a
// suggestion the buyer may act on — the cart is never changed here. Matching is
// conservative (sameMedicine.ts: generic name, strength, form, release type,
// schedule and pack). Candidates follow the listing rules: active, in stock, never
// Schedule X / NDPS (C-10). The pharmacist checks prescription lines before
// dispatch whichever brand is chosen (C-08).
import { query } from '../../config/database';
import { BuyerType } from '../../utils/customerType';
import { buyerColumns } from '../search/productSearch.service';
import { ProductCard, SELLABLE_SQL, cardColumnsSql, toCards } from './productCards';
import { cheapestSame, normaliseGeneric } from './sameMedicine';
import { BuyerStanding, mayBuySql } from '../buyerRestriction/rules';

export interface CheaperOption {
  /** the cart line this is cheaper than */
  for_product_id: string;
  product: ProductCard;
  /** per unit, at the buyer's own prices */
  saving_paise: number;
}

// Sprint 47: only alternatives this buyer may buy now
export async function cheaperOptions(userId: string, pricingType: BuyerType, buyer: BuyerStanding): Promise<CheaperOption[]> {
  const { displayPrice } = buyerColumns(pricingType);
  const lines = await query<any>(
    `SELECT p.id, p.name, p.generic_name, p.drug_schedule, p.net_quantity, (${displayPrice})::int AS price_paise
     FROM cart_items c JOIN products p ON p.id = c.product_id
     WHERE c.user_id = $1 AND p.generic_name IS NOT NULL AND ${SELLABLE_SQL}
     ORDER BY c.added_at`, [userId]);
  if (!lines.length) return [];
  const generics = [...new Set(lines.map((l) => normaliseGeneric(l.generic_name)).filter(Boolean))];
  // Same generic name, not already in the cart; the exact match is done in TS
  const rows = await query<any>(
    `SELECT ${cardColumnsSql(pricingType)}, p.net_quantity
     FROM products p
     WHERE ${SELLABLE_SQL} AND ${mayBuySql('p', buyer)}
       AND btrim(regexp_replace(lower(p.generic_name), '[^a-z0-9]+', ' ', 'g')) = ANY($2::text[])
       AND NOT EXISTS (SELECT 1 FROM cart_items c WHERE c.user_id = $1 AND c.product_id = p.id)
     LIMIT 500`, [userId, generics]);
  const candidates = rows.map((r) => ({
    product: { ...r, in_stock: Number(r.stock_qty) > 0 }, price_paise: Number(r.display_price_paise),
  }));

  const picks: { line: any; best: any }[] = [];
  for (const line of lines) {
    const best = cheapestSame({ ...line, price_paise: Number(line.price_paise) }, candidates);
    if (best) picks.push({ line, best });
  }
  if (!picks.length) return [];
  const cards = await toCards(picks.map((p) => p.best.product), pricingType, buyer);
  return picks.map((p, i) => ({
    for_product_id: p.line.id,
    product: cards[i],
    saving_paise: Number(p.line.price_paise) - p.best.price_paise,
  }));
}
