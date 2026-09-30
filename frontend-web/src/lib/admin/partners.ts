import api from '../api';

export interface ApprovedVendor {
  id: string;
  name: string;
  drug_license_no: string | null;
  gst_number: string | null;
  contact_name: string | null;
  contact_mobile: string | null;
  vendor_type: string | null;
  approval_status: string;
  vendor_rating: number | string | null;
  pincode: string | null;
  city: string | null;
  state: string | null;
  created_at: string;
}

export const partnerAdminKeys = { approved: ['admin', 'vendors', 'partners'] as const };

const PARTNER_TYPES = ['marketplace_partner', 'both'];

/** Approved vendors that sell on the marketplace (GET /vendors?status=approved). */
export async function fetchApprovedPartners(): Promise<ApprovedVendor[]> {
  const { data } = await api.get('/vendors', { params: { status: 'approved' } });
  const vendors: ApprovedVendor[] = data.data?.vendors ?? [];
  return vendors.filter((v) => PARTNER_TYPES.includes(v.vendor_type ?? ''));
}

export async function linkPartnerLogin(vendorId: string, mobile: string) {
  const { data } = await api.post(`/admin/partners/${vendorId}/users`, { mobile });
  return data.data as { vendor_id: string; user_id: string };
}

export async function setPartnerCommission(vendorId: string, body: { commission_pct: number; finding_fee_paise: number }) {
  const { data } = await api.put(`/admin/partners/${vendorId}/commission`, body);
  return data.data;
}
