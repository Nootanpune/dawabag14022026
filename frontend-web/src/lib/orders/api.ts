// Buyer order detail and cancellation (C-37). Every amount, flag and code is
// the server's; the page only displays them.
import api from '../api';

export interface OrderItem {
  id: string;
  product_id: string;
  product_name: string;
  sku: string;
  quantity: number;
  line_total_paise: number;
  drug_schedule: string | null;
  shipment_id: string | null;
}

export interface OrderShipmentDetail {
  id: string;
  seller_type: string;
  seller_name: string | null;
  invoice_number: string | null;
  status: string;
  total_paise: number;
  courier_partner: string | null;
  awb_number: string | null;
  dispatched_at: string | null;
  delivered_at: string | null;
  seal_number: string | null;
  handover_code_required: boolean;
  /** buyer only, while the sealed pack is on its way (C-26) */
  handover_code: string | null;
  received_by_name: string | null;
  received_by_relation: string | null;
  /** latest courier scan, normalised by the server (Sprint 8); null before booking */
  tracking_status?: TrackingStatus | null;
  /** set when the courier returns the parcel to Dawabag undelivered */
  rto_at?: string | null;
  /** courier scans, oldest first */
  tracking?: TrackingEvent[];
}

export type TrackingStatus = 'booked' | 'picked_up' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'exception' | 'rto';

export interface TrackingEvent {
  status: TrackingStatus | string;
  /** the courier's own wording, e.g. "REACHED AT DESTINATION HUB" */
  raw_status: string | null;
  location: string | null;
  event_time: string;
}

export interface OrderCreditNote {
  id: string;
  credit_note_number: string;
  shipment_id: string | null;
  reason: string;
  total_paise: number;
  created_at?: string;
}

export interface OrderRefund {
  id: string;
  source: string;
  method: string;
  amount_paise: number;
  status: string;
  processed_at: string | null;
  created_at?: string;
}

export interface OrderReturn {
  id: string;
  return_no: string;
  shipment_id: string;
  reason: string;
  status: string;
  refund_paise: number;
  created_at?: string;
}

export interface OrderDetail {
  id: string;
  order_number: string;
  invoice_number: string | null;
  status: string;
  created_at: string;
  subtotal_paise: number;
  shipping_paise: number;
  discount_paise: number;
  total_paise: number;
  payment_method?: string | null;
  gateway_payment_id?: string | null;
  awb_number?: string | null;
  courier_partner?: string | null;
  tracking_url?: string | null;
  delivery_name?: string | null;
  delivery_mobile?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  pincode?: string | null;
  items: OrderItem[];
  shipments: OrderShipmentDetail[];
  requires_prescription: boolean;
  can_cancel: boolean;
  credit_notes: OrderCreditNote[];
  refunds: OrderRefund[];
  returns: OrderReturn[];
}

export interface CancelResult {
  id: string;
  status: string;
  refund_paise: number;
  refunds: unknown[];
  credit_notes: string[];
}

export const orderKeys = {
  mine: ['my-orders'] as const,
  one: (id: string) => ['order', id] as const,
};

export async function fetchOrder(id: string): Promise<OrderDetail> {
  const { data } = await api.get(`/orders/${id}`);
  return data.data;
}

/** POST /orders/:id/cancel — allowed until packing starts; the server computes the refund. */
export async function cancelOrder(id: string, reason: string): Promise<CancelResult> {
  const { data } = await api.post(`/orders/${id}/cancel`, { reason });
  return data.data;
}

export const REFUND_METHOD_LABELS: Record<string, string> = {
  gateway: 'To original payment method',
  wallet: 'To Dawabag wallet',
  credit_adjustment: 'Adjusted against credit',
  manual: 'Bank transfer',
};
