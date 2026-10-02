import type { OrderShipment } from '@/components/orders/SoldBySection';

// Address → prescription (only when needed) → review (C-35) → payment (Sprint 26 order).
// 'rx-fix': the order is placed but the chosen prescription could not go with it.
export type CheckoutStep = 'address' | 'prescription' | 'review' | 'rx-fix' | 'payment' | 'confirmed';

/** Subset of the order returned by POST /orders (data.order) — amounts are the server's. */
export interface PlacedOrder {
  id: string;
  order_number: string;
  total_paise: number;
  requires_prescription: boolean;
  payment_terms?: string;
  /** Dawabag's invoice number; null when only marketplace partners ship */
  invoice_number?: string | null;
  /** one shipment per seller of record */
  shipments?: OrderShipment[];
}
