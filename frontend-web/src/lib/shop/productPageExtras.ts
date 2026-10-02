// Product page extras (Sprint 33): substitutes and the estimated delivery date.
// Read from the server on every visit; the PIN typed on the page lives only in
// component state (never in browser storage).
import api from '../api';

export interface Substitute {
  id: string;
  name: string;
  generic_name: string | null;
  sku: string;
  drug_schedule: string;
  mrp_paise: number;
  display_price_paise: number;
  min_order_qty: number;
  stock_qty: number;
  in_stock: boolean;
  requires_prescription: boolean;
  image_url: string | null;
  net_quantity: string | null;
  maker: string | null;
  per_unit_paise: number;
  unit_label: string;
  /** whole % saved per unit against the product being viewed; null when not cheaper */
  save_pct: number | null;
}

export interface SubstitutesResult {
  product: { id: string; name: string; per_unit_paise: number; unit_label: string };
  note: string;
  consult_href: string;
  total: number;
  substitutes: Substitute[];
}

export interface DeliveryEstimate {
  pincode: string | null;
  needs_pincode?: boolean;
  pincode_source?: 'entered' | 'saved_address' | null;
  serviceable?: boolean;
  city?: string | null;
  deliver_by?: string | null;
  label?: string | null;
  estimated?: true;
  message?: string;
}

export const productPageKeys = {
  substitutes: (id: string, limit?: number) => ['substitutes', id, limit ?? 'all'] as const,
  delivery: (id: string, pincode: string) => ['delivery-estimate', id, pincode] as const,
};

export async function fetchSubstitutes(productId: string, limit?: number): Promise<SubstitutesResult> {
  const { data } = await api.get(`/medicines/${productId}/substitutes`, { params: limit ? { limit } : {} });
  return data.data;
}

export async function fetchDeliveryEstimate(productId: string, pincode: string): Promise<DeliveryEstimate> {
  const { data } = await api.get(`/medicines/${productId}/delivery`, { params: pincode ? { pincode } : {} });
  return data.data;
}

/** "₹2.00 per tablet" */
export const perUnitText = (paise: number, unitLabel: string) => `₹${(paise / 100).toFixed(2)} ${unitLabel}`;
