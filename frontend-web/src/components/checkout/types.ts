import type { OrderShipment } from '@/components/orders/SoldBySection';

export type CheckoutStep = 'address' | 'review' | 'prescription' | 'payment' | 'confirmed';

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
