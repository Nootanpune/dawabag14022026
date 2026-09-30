export type CheckoutStep = 'address' | 'prescription' | 'payment' | 'confirmed';

/** Subset of the order returned by POST /orders (data.order) — amounts are the server's. */
export interface PlacedOrder {
  id: string;
  order_number: string;
  total_paise: number;
  requires_prescription: boolean;
  payment_terms?: string;
}
