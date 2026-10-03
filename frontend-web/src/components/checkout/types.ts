import type { OrderShipment } from '@/components/orders/SoldBySection';

// Address → prescription (only when needed) → review (C-35) → payment (Sprint 26 order).
// Sprint 39: the prescription goes WITH the order (POST /orders refuses a prescription order without one).
export type CheckoutStep = 'address' | 'prescription' | 'review' | 'payment' | 'confirmed';

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
  /** Sprint 39: 'after_pharmacist_check' = the payment is only authorised until the pharmacist's check passes */
  capture?: 'now' | 'after_pharmacist_check';
}
