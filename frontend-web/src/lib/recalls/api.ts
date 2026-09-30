// Batch recalls (admin) — Rulebook C-28. Recalling a batch blocks it from
// packing/dispatch and notifies affected buyers; all done on the server.
import api from '../api';

export interface Recall {
  id: string;
  product_id: string;
  product_name: string;
  batch_number: string;
  reason: string;
  source: string | null;
  recalled_at: string;
  recalled_by_name: string | null;
}

export interface RecallAffected {
  order_id: string;
  order_number: string;
  user_id: string;
  order_status: string;
  order_item_id: string;
  quantity: number;
  shipment_status: string | null;
  seller_type: string | null;
  buyer_name: string | null;
}

export interface RecallDetail extends Recall {
  affected: RecallAffected[];
}

export interface RecallResult {
  id: string;
  product_name: string;
  batch_number: string;
  own_batches: number;
  partner_batches: number;
  orders_notified: number;
  awaiting_dispatch: number;
}

export interface ProductHit {
  id: string;
  name: string;
  generic_name: string | null;
  sku: string;
  drug_schedule: string | null;
}

export const recallKeys = {
  list: ['recalls'] as const,
  one: (id: string) => ['recalls', id] as const,
  productSearch: (q: string) => ['recalls', 'product-search', q] as const,
};

export async function fetchRecalls(): Promise<Recall[]> {
  const { data } = await api.get('/recalls');
  return data.data?.recalls ?? [];
}

export async function fetchRecall(id: string): Promise<RecallDetail> {
  const { data } = await api.get(`/recalls/${id}`);
  return data.data;
}

export async function createRecall(body: { product_id: string; batch_number: string; reason: string; source?: string }) {
  const { data } = await api.post('/recalls', body);
  return data.data as RecallResult;
}

/** Catalogue search (GET /products/search?q=) used to pick the recalled product. */
export async function searchProducts(q: string): Promise<ProductHit[]> {
  const { data } = await api.get('/products/search', { params: { q, limit: 10 } });
  return data.data?.products ?? [];
}
