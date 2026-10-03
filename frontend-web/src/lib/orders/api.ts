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
  /** Sprint 43: taken off by the buyer before packing (credit note issued); supply_qty = quantity - removed_qty */
  removed_qty?: number;
  supply_qty?: number;
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
  /** Sprint 35: the registered pharmacist who checked and released this shipment (C-08) */
  pharmacist_check?: PharmacistCheckState;
  pharmacist_name?: string | null;
  pharmacist_reg_no?: string | null;
  pharmacist_checked_at?: string | null;
}

/** Sprint 35: every order is checked by a pharmacist before packing (C-08) */
export type PharmacistCheckState = 'pending' | 'held' | 'released' | 'rejected' | 'not_recorded';

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
  gst_paise?: number;
  wallet_used_paise?: number;
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
  /** Why the order was cancelled; for a pharmacist's refusal, the reason written for the buyer (never the staff-only hold note) */
  cancellation_reason?: string | null;
  cancelled_at?: string | null;
  /** Sprint 35: released once every shipment is (not_recorded: orders from before the check existed) */
  pharmacist_check?: PharmacistCheckState;
  credit_notes: OrderCreditNote[];
  refunds: OrderRefund[];
  returns: OrderReturn[];
  /** Sprint 43: the buyer may lower quantities / remove lines until packing starts (URS-074) */
  can_edit?: boolean;
  edit_block_reason?: string | null;
  edits?: OrderEdit[];
  /** Sprint 39: a prescription order's payment is authorised until the pharmacist's check, then captured (or released) */
  payment?: { status: string; capture: 'now' | 'after_pharmacist_check'; authorised_at: string | null; captured_at: string | null;
    released_at: string | null; note?: string } | null;
}

/** Sprint 43: one change the buyer made before packing */
export interface OrderEdit {
  id: string;
  edited_at: string;
  lines: { order_item_id: string; product_name: string; from_qty: number; to_qty: number }[];
  credit_notes: { credit_note_number: string; shipment_id: string; total_paise: number }[];
  refund_paise: number;
  /** none · recorded (refund on its way) · after_capture (refunded right after the held payment is taken) · not_needed */
  refund_status: 'none' | 'recorded' | 'after_capture' | 'not_needed';
}

export interface EditResult {
  id: string;
  refund_paise: number;
  refund_status: OrderEdit['refund_status'];
  credit_notes: string[];
  message: string;
}

/** POST /orders/:id/edit — lower quantities (0 removes the line); the server issues credit notes and refunds. */
export async function editOrder(id: string, lines: { order_item_id: string; quantity: number }[]): Promise<EditResult> {
  const { data } = await api.post(`/orders/${id}/edit`, { lines });
  return data.data;
}

export interface CancelResult {
  id: string;
  status: string;
  refund_paise: number;
  /** Sprint 39: an authorised payment released instead of refunded (never charged) */
  released_paise?: number;
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

/** Sprint 43 (QA): why a refund or credit note was made, in words */
export const REFUND_SOURCE_LABELS: Record<string, string> = {
  cancellation: 'order cancelled',
  return: 'return',
  admin: 'from Dawabag',
  order_edit: 'order changed',
};
export const CREDIT_NOTE_REASON_LABELS: Record<string, string> = {
  cancellation: 'order cancelled',
  order_edit: 'order changed before packing',
};

export const REFUND_METHOD_LABELS: Record<string, string> = {
  gateway: 'To original payment method',
  wallet: 'To Dawabag wallet',
  credit_adjustment: 'Adjusted against credit',
  manual: 'Bank transfer',
};
