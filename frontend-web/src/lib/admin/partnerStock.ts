// Admin view of partner stock imports and the new-product requests partners send
// from them (Sprint 27). Requests are resolved by creating the product through the
// normal product form (pharmacist copy review, C-19; never Schedule X / NDPS, C-10)
// and linking it here, so the partner's next upload matches it.
import api from '../api';
import type { ImportListItem } from '../partner/stockImport';

export interface ProductRequest {
  id: string;
  partner_id: string;
  partner_name: string;
  item_name: string;
  pack: string | null;
  manufacturer: string | null;
  item_code: string | null;
  hsn_code: string | null;
  gst_rate: string | number | null;
  mrp_paise: number | null;
  ptr_paise: number | null;
  status: 'open' | 'linked' | 'rejected';
  product_id: string | null;
  product_name: string | null;
  requested_at: string;
  resolution_note: string | null;
}

export type AdminImportItem = ImportListItem & { partner_id: string; partner_name: string };

export const partnerStockKeys = {
  requests: (status: string) => ['admin', 'partner-product-requests', status] as const,
  imports: ['admin', 'partner-stock-imports'] as const,
};

export async function fetchProductRequests(status: ProductRequest['status']): Promise<ProductRequest[]> {
  const { data } = await api.get('/admin/partner-product-requests', { params: { status } });
  return data.data?.requests ?? [];
}

export async function fetchPartnerImports(): Promise<AdminImportItem[]> {
  const { data } = await api.get('/admin/partner-stock-imports');
  return data.data?.imports ?? [];
}

export async function linkProductRequest(id: string, productId: string) {
  const { data } = await api.post(`/admin/partner-product-requests/${id}/resolve`, { product_id: productId });
  return data.data;
}

export async function rejectProductRequest(id: string, reason: string) {
  const { data } = await api.post(`/admin/partner-product-requests/${id}/resolve`, { reject_reason: reason });
  return data.data;
}
