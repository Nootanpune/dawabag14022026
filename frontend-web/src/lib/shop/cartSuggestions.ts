// Cart suggestions from the server (Sprint 25). Only suggestions: the cart changes
// only when the buyer adds something (PUT /cart/items). Listing rules (active, never
// Schedule X / NDPS, C-10), buyer prices and stock are the server's.
import api from '../api';
import type { CartView } from '../cart';

export interface SuggestedProduct {
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

export interface CheaperOption {
  /** the cart line it is cheaper than */
  for_product_id: string;
  product: SuggestedProduct;
  /** per unit */
  saving_paise: number;
}

/** Changes whenever the cart's lines or quantities change, so suggestions are re-asked. */
export const cartShape = (cart: CartView | undefined) =>
  (cart?.items ?? []).map((i) => `${i.product_id}:${i.quantity}`).join(',');

export const cartSuggestionKeys = {
  buyAgain: (shape: string) => ['cart', 'buy-again', shape] as const,
  cheaper: (shape: string) => ['cart', 'cheaper-options', shape] as const,
};

export async function fetchBuyAgain(): Promise<SuggestedProduct[]> {
  const { data } = await api.get('/cart/buy-again');
  return data.data?.products ?? [];
}

export async function fetchCheaperOptions(): Promise<CheaperOption[]> {
  const { data } = await api.get('/cart/cheaper-options');
  return data.data?.options ?? [];
}
