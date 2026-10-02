// "Substitutes" on the product page and its full list (Sprint 33). Candidates
// follow the same listing rules as search and the cart's cheaper option: active,
// not deleted, never Schedule X / NDPS (C-10); prices are the buyer's own for
// their type; stock is the most one seller can supply; the pack photo only once a
// pharmacist approved it (C-19). The match itself is conservative (substitutes.ts
// → sameMedicine.ts). A list only — never an automatic swap; the buyer is told to
// ask their doctor or pharmacist, and prescription lines are checked by our
// pharmacist whichever brand is chosen (C-08).
import { query, queryOne } from '../../config/database';
import { AppError } from '../../utils/AppError';
import { BuyerType } from '../../utils/customerType';
import { buyerColumns } from '../search/productSearch.service';
import { SELLABLE_SQL, cardColumnsSql, toCards } from './productCards';
import { normaliseGeneric } from './sameMedicine';
import { SUBSTITUTE_NOTE, pricePerUnit, rankSubstitutes, unitLabel } from './substitutes';

export async function substitutesFor(productId: string, pricingType: BuyerType, limit?: number) {
  const { displayPrice } = buyerColumns(pricingType);
  const current = await queryOne<any>(
    `SELECT p.id, p.name, p.generic_name, p.drug_schedule, p.net_quantity, (${displayPrice})::int AS price_paise
     FROM products p WHERE p.id = $1 AND ${SELLABLE_SQL}`, [productId]);
  if (!current) throw new AppError('Product not found', 404);
  const base = {
    product: { id: current.id, name: current.name, per_unit_paise: Math.round(pricePerUnit(Number(current.price_paise), current.net_quantity)),
      unit_label: unitLabel(current.net_quantity) },
    note: SUBSTITUTE_NOTE,
    consult_href: '/consult',
  };
  const generic = normaliseGeneric(current.generic_name);
  if (!generic) return { ...base, total: 0, substitutes: [] };

  // Same generic name (the exact match — strengths, form, release, route, schedule, pack — is done in TS)
  const rows = await query<any>(
    `SELECT ${cardColumnsSql(pricingType)}, p.net_quantity, p.marketed_by, p.manufacturer_name
     FROM products p
     WHERE ${SELLABLE_SQL} AND p.id <> $1
       AND btrim(regexp_replace(lower(p.generic_name), '[^a-z0-9]+', ' ', 'g')) = $2
     LIMIT 500`, [productId, generic]);
  const ranked = rankSubstitutes(
    { ...current, price_paise: Number(current.price_paise) },
    rows.map((r) => ({ ...r, price_paise: Number(r.display_price_paise), in_stock: Number(r.stock_qty) > 0 })),
  );
  const shown = limit ? ranked.slice(0, limit) : ranked;
  const cards = await toCards(shown.map((s) => s.product), pricingType);
  return {
    ...base,
    total: ranked.length,
    substitutes: shown.map((s, i) => ({
      ...cards[i],
      net_quantity: s.product.net_quantity ?? null,
      maker: s.product.manufacturer_name || s.product.marketed_by || null,
      per_unit_paise: Math.round(s.per_unit_paise),
      unit_label: s.unit_label,
      save_pct: s.save_pct,
    })),
  };
}
