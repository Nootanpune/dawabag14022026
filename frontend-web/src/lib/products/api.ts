// Product page and pharmacist copy review. The server returns only the
// buyer's own price, the pre-packed goods declarations (C-17) and product
// copy only after a pharmacist approved it (C-19).
import api from '../api';

export interface ProductDetail {
  id: string;
  name: string;
  generic_name: string | null;
  sku: string;
  category: string | null;
  drug_schedule: string | null;
  hsn_code: string | null;
  gst_rate: number | string | null;
  marketed_by: string | null;
  composition: string | null;
  storage_instructions: string | null;
  cold_chain: boolean;
  mrp_paise: number;
  /** the signed-in buyer's own price (offer / PTR / PTS / institutional) */
  price_paise: number;
  discount_pct: number;
  net_quantity: string | null;
  manufacturer_name: string | null;
  manufacturer_address: string | null;
  country_of_origin: string | null;
  /** YYYY-MM of the batch that will be supplied (FEFO) */
  supplied_batch_expiry: string | null;
  /** null until a pharmacist approves the copy */
  description: string | null;
  content_reviewed: boolean;
  /** signed short-lived link to the pack photo; customers get it only once approved (C-19), staff always */
  image_url: string | null;
  /** admin record only: the stored photo's object-store key and the copy/photo review state */
  s3_image_key?: string | null;
  content_status?: 'pending_review' | 'approved' | 'rejected';
  max_qty_per_order: number;
  in_stock: boolean;
  requires_prescription: boolean;
  cannot_order_online: boolean;
}

export interface ContentFlag {
  condition: string;
  claim: string;
  excerpt: string;
}

export interface ContentReviewItem {
  id: string;
  sku: string;
  name: string;
  drug_schedule: string | null;
  description: string | null;
  composition: string | null;
  storage_instructions: string | null;
  content_flags: ContentFlag[] | null;
  /** the pack photo under review with the copy, if any */
  image_url: string | null;
  updated_at: string;
}

export const productKeys = {
  one: (id: string) => ['product', id] as const,
  contentQueue: ['products', 'content-review'] as const,
};

export async function fetchProduct(id: string): Promise<ProductDetail> {
  const { data } = await api.get(`/products/${id}`);
  return data.data;
}

export async function fetchContentQueue(): Promise<ContentReviewItem[]> {
  const { data } = await api.get('/products/content-review/queue');
  return data.data?.products ?? [];
}

/** Flagged copy needs notes of at least 20 characters to approve (server-enforced). */
export async function reviewContent(productId: string, approve: boolean, notes: string) {
  const { data } = await api.post(`/products/${productId}/content-review`, { approve, notes });
  return data.data;
}
