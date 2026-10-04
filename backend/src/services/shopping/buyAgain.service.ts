// "Buy again" in the cart (Sprint 25): medicines from the buyer's own delivered
// orders that are not in the cart now, most recent first. Only products a buyer
// can still order online are offered (active, never Schedule X / NDPS — C-10).
// A prescription medicine still needs a valid prescription at checkout and the
// pharmacist's check before dispatch (C-08); offering it here changes nothing.
import { query } from '../../config/database';
import { BuyerType } from '../../utils/customerType';
import { ProductCard, SELLABLE_SQL, cardColumnsSql, toCards } from './productCards';
import { BuyerStanding, mayBuySql } from '../buyerRestriction/rules';

export const BUY_AGAIN_LIMIT = 8;

// Sprint 47: only products this buyer may buy now (a suggestion to add)
export async function buyAgain(userId: string, pricingType: BuyerType, buyer: BuyerStanding, limit = BUY_AGAIN_LIMIT): Promise<ProductCard[]> {
  const rows = await query<any>(
    `WITH bought AS (
       SELECT oi.product_id, MAX(COALESCE(o.delivered_at, o.created_at)) AS last_at
       FROM orders o JOIN order_items oi ON oi.order_id = o.id
       WHERE o.user_id = $1 AND o.status = 'delivered'
       GROUP BY oi.product_id
     )
     SELECT ${cardColumnsSql(pricingType)}
     FROM bought JOIN products p ON p.id = bought.product_id
     WHERE ${SELLABLE_SQL} AND ${mayBuySql('p', buyer)}
       AND NOT EXISTS (SELECT 1 FROM cart_items c WHERE c.user_id = $1 AND c.product_id = p.id)
     ORDER BY bought.last_at DESC, p.name
     LIMIT $2`,
    [userId, limit],
  );
  return toCards(rows, pricingType, buyer);
}
