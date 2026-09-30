import api from '../api';

export interface ListingForReview {
  id: string;
  product_id: string;
  medicine_name: string;
  drug_schedule: string | null;
  mrp_paise: number;
  cold_chain: boolean;
  partner_sku: string | null;
  submission_date: string | null;
  approval_status: string;
  listing_status: string;
  h1_pharmacist_name: string | null;
  h1_pharmacist_reg_no: string | null;
  h1_secure_storage_declared: boolean | null;
  partner_id: string;
  partner_name: string;
  pincode: string | null;
  vendor_rating: number | string | null;
  gst_number: string | null;
  drug_license_no: string | null;
  drug_license_expiry: string | null;
  qty_available: number | null;
}

/** REJ-01 … REJ-14 (codes defined by the marketplace SOP; server validates the format). */
export const REJECTION_CODES = Array.from({ length: 14 }, (_, i) => `REJ-${String(i + 1).padStart(2, '0')}`);

export const listingKeys = { queue: ['admin', 'listings', 'queue'] as const };

export async function fetchListingQueue(): Promise<ListingForReview[]> {
  const { data } = await api.get('/vendors/partner-products/pending');
  return data.data?.products ?? [];
}

export async function approveListing(id: string) {
  const { data } = await api.post(`/vendors/partner-products/${id}/approve`);
  return data.data;
}

export async function rejectListing(id: string, body: { rejection_reason_code: string; rejection_details?: string }) {
  const { data } = await api.post(`/vendors/partner-products/${id}/reject`, body);
  return data.data;
}

export async function postListingLive(id: string) {
  const { data } = await api.post(`/vendors/partner-products/${id}/post-live`);
  return data.data;
}
