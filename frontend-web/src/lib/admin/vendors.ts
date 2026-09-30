import api from '../api';

export interface PendingVendor {
  id: string;
  name: string;
  drug_license_no: string | null;
  gst_number: string | null;
  contact_name: string | null;
  contact_mobile: string | null;
  contact_email: string | null;
  vendor_type: string | null;
  pincode: string | null;
  city: string | null;
  state: string | null;
  created_at: string;
  dl_portal_url: string | null;
}

export type VendorType = 'supplier' | 'marketplace_partner' | 'both';

export interface VendorApproval {
  drug_license_type: 'dl20' | 'dl21' | 'dl20b' | 'dl21b';
  drug_license_expiry: string;
  vendor_type: VendorType;
}

export const vendorKeys = { pending: ['admin', 'vendors', 'pending'] as const };

export async function fetchPendingVendors(): Promise<PendingVendor[]> {
  const { data } = await api.get('/vendors/pending-approval');
  return data.data?.vendors ?? [];
}

export async function approveVendor(id: string, body: VendorApproval) {
  const { data } = await api.post(`/vendors/${id}/approve`, body);
  return data.data;
}

export async function rejectVendor(id: string, rejection_reason: string) {
  const { data } = await api.post(`/vendors/${id}/reject`, { rejection_reason });
  return data.data;
}
