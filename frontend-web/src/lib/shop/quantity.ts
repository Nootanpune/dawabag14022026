// The buyer's own order limits for a medicine, as the server gives them: the cart line
// (min_qty / max_qty by buyer type, stock) when it is in the cart, else the search or
// product data. The server checks again on every change and at checkout.
import type { CartLine } from '../cart';

export interface QtyLimits { min: number; max: number; maxMessage: string; minMessage: string | null }

export function quantityLimits(
  p: { min_order_qty?: number | null; max_order_qty?: number | null; max_qty_per_order?: number | null },
  line?: Pick<CartLine, 'min_qty' | 'max_qty' | 'stock_qty'> | null,
): QtyLimits {
  const min = Math.max(1, Number(line?.min_qty ?? p.min_order_qty ?? 1) || 1);
  const perOrder = Number(line?.max_qty ?? p.max_order_qty ?? p.max_qty_per_order ?? 99) || 99;
  const stock = line?.stock_qty != null && line.stock_qty > 0 ? line.stock_qty : Infinity;
  const max = Math.max(min, Math.min(perOrder, stock));
  const maxMessage = stock < perOrder
    ? `Only ${stock} in stock right now.`
    : `You can order up to ${perOrder} of this medicine in one order.`;
  return { min, max, maxMessage, minMessage: min > 1 ? `Minimum order is ${min}.` : null };
}
