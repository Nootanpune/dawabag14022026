// Server cart API (the server owns the cart and every price — never compute them here).
import api from './api';

export interface CartLine {
  product_id: string;
  name: string;
  sku: string;
  drug_schedule: string;
  cold_chain: boolean;
  image_key: string | null;
  /** signed link to the approved pack photo (C-19), or null */
  image_url: string | null;
  quantity: number;
  unit_price_paise: number;
  mrp_paise: number;
  line_subtotal_paise: number;
  min_qty: number;
  max_qty: number;
  stock_qty: number;
  available: boolean;
  issue: string | null;
  requires_prescription: boolean;
}

export interface CartCoupon {
  code: string;
  discount_paise: number;
  valid: boolean;
  message: string | null;
}

/** Retail free delivery from the server: the amount and how much more is needed (0 = free) */
export interface FreeDelivery {
  above_paise: number;
  remaining_paise: number;
}

export interface CartView {
  items: CartLine[];
  coupon: CartCoupon | null;
  pricing_type: string;
  subtotal_paise: number;
  discount_paise: number;
  /** null for trade buyers or when the owner has switched it off */
  free_delivery: FreeDelivery | null;
  requires_prescription: boolean;
  item_count: number;
}

export const CART_QUERY_KEY = ['cart'] as const;

export async function fetchCart(): Promise<CartView> {
  const { data } = await api.get('/cart');
  return data.data;
}

/** Absolute quantity; 0 removes the line. */
export async function putCartItem(productId: string, quantity: number): Promise<CartView> {
  const { data } = await api.put(`/cart/items/${productId}`, { quantity });
  return data.data;
}

/** null or '' removes the coupon. */
export async function putCartCoupon(code: string | null): Promise<CartView> {
  const { data } = await api.put('/cart/coupon', { code });
  return data.data;
}

export async function deleteCart(): Promise<CartView> {
  const { data } = await api.delete('/cart');
  return data.data;
}
