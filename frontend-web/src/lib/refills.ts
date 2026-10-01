// Buyer refill subscriptions + automatic-payment mandates (/refills). Server is the source of truth.
import api from './api';

export interface RefillItem {
  product_id: string;
  name: string;
  quantity: number;
}

export interface Refill {
  id: string;
  order_id: string;
  source_order_number: string | null;
  frequency_days: number;
  next_refill_date: string;
  is_active: boolean;
  auto_charge: boolean;
  mandate_id: string | null;
  mandate_status: string | null;
  last_order_id: string | null;
  items: RefillItem[];
}

export interface Mandate {
  id: string;
  method: string;
  max_amount_paise: number;
  status: string;
  created_at: string;
  activated_at: string | null;
}

export interface MandateCheckout {
  mandate_id: string;
  razorpay_order_id: string;
  customer_id: string;
  key_id: string;
  recurring: string;
}

export interface RefillChanges {
  frequency_days?: number;
  is_active?: boolean;
  mandate_id?: string | null;
  items?: { product_id: string; quantity: number }[];
}

export const MIN_FREQUENCY_DAYS = 7;
export const MAX_FREQUENCY_DAYS = 180;
/** Per-charge ceiling for automatic payment (₹15,000). */
export const MAX_MANDATE_PAISE = 1_500_000;

export const REFILL_UX_COPY =
  "We'll remind you 3 days before each refill. On the refill date we place the order; if automatic " +
  "payment is on, we charge your saved method — otherwise you'll get a link to pay. Prescription " +
  'medicines are checked by our pharmacist before any charge.';

export const refillKeys = {
  all: ['refills'] as const,
  list: ['refills', 'list'] as const,
  mandates: ['refills', 'mandates'] as const,
};

export async function fetchRefills(): Promise<Refill[]> {
  const { data } = await api.get('/refills');
  return data.data?.refills ?? [];
}

export async function createRefill(order_id: string, frequency_days: number) {
  const { data } = await api.post('/refills', { order_id, frequency_days });
  return data.data as { id: string; next_refill_date: string };
}

export async function updateRefill(id: string, changes: RefillChanges): Promise<Refill[]> {
  const { data } = await api.patch(`/refills/${id}`, changes);
  return data.data?.refills ?? [];
}

export async function cancelRefill(id: string) {
  const { data } = await api.delete(`/refills/${id}`);
  return data.data;
}

export async function fetchMandates(): Promise<Mandate[]> {
  const { data } = await api.get('/refills/mandates/list');
  return data.data?.mandates ?? [];
}

export async function startMandate(body: { max_amount_paise: number; method: 'upi' | 'card' }): Promise<MandateCheckout> {
  const { data } = await api.post('/refills/mandates', body);
  return data.data;
}

export async function cancelMandate(id: string) {
  const { data } = await api.delete(`/refills/mandates/${id}`);
  return data.data;
}
