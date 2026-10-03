// Checkout: the pre-payment disclosure (Rulebook C-35) and order placement.
// POST /orders/preview takes the same body as POST /orders and returns what
// the order will be — sellers, licences, lines, charges — without placing it.
import api from './api';
import type { Address } from './addresses';
import type { CartView } from './cart';
import type { PolicyKey } from './legal/policies';

export const PRACTITIONER_DECLARATION_TEXT =
  'These medicines are for dispensing to my own patients only, not for resale';

export interface OrderBody {
  address_id: string;
  pincode: string;
  items: { product_id: string; quantity: number }[];
  coupon_code?: string;
  /** doctors / hospitals confirm on every order (C-15) */
  practitioner_declaration?: boolean;
  /** Sprint 39: the prescription for the order's prescription lines, chosen before payment (C-08) */
  prescription_id?: string;
  /** Sprint 44: a doctor's / institution's signed written order (Drugs Rules r.65(9)(b)) */
  written_order_id?: string;
}

export interface PreviewLine {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price_paise: number;
  mrp_paise: number;
  gst_rate: number | string;
  line_total_paise: number;
  drug_schedule: string | null;
  net_quantity: string | null;
  manufacturer: string | null;
  country_of_origin: string | null;
  batch_expiry: string | null; // YYYY-MM
}

export interface PreviewShipment {
  seller_type: string;
  seller_name: string | null;
  seller_licence: string | null;
  /** every drug licence of the seller of record (Sprint 30) */
  seller_licences?: { form: string; label: string; number: string; valid_upto: string | null }[];
  ships_from: string | null;
  delivery_estimate: string;
  cold_chain: boolean;
  subtotal_paise: number;
  gst_paise: number;
  total_paise: number;
  lines: PreviewLine[];
}

export interface CheckoutPreview {
  shipments: PreviewShipment[];
  charges: {
    items_paise: number;
    gst_paise: number;
    delivery_paise: number;
    discount_paise: number;
    wallet_paise: number;
    total_payable_paise: number;
  };
  payment_terms: string;
  returns_note: string;
  policies: { doc_key: PolicyKey; version: number; title: string; effective_from: string }[];
}

export function buildOrderBody(address: Address, cart: CartView, declaration?: boolean, prescriptionId?: string | null, writtenOrderId?: string | null): OrderBody {
  return {
    address_id: address.id,
    pincode: address.pincode,
    items: cart.items.map((i) => ({ product_id: i.product_id, quantity: i.quantity })),
    coupon_code: cart.coupon?.valid ? cart.coupon.code : undefined,
    ...(declaration ? { practitioner_declaration: true } : {}),
    ...(prescriptionId ? { prescription_id: prescriptionId } : {}),
    ...(writtenOrderId ? { written_order_id: writtenOrderId } : {}),
  };
}

/** The server refused the order or payment because the prescription is missing or unusable (Sprint 39). */
export function isPrescriptionProblem(err: unknown): boolean {
  const data = (err as { response?: { data?: { code?: string; message?: string } } })?.response?.data;
  return data?.code === 'PRESCRIPTION_REQUIRED' || /prescription/i.test(data?.message ?? '');
}

export const checkoutKeys = {
  preview: (body: OrderBody) => ['checkout', 'preview', body] as const,
};

export async function previewOrder(body: OrderBody): Promise<CheckoutPreview> {
  const { data } = await api.post('/orders/preview', body);
  return data.data;
}

export async function placeOrder(body: OrderBody) {
  const { data } = await api.post('/orders', body);
  return data.data.order;
}
