import api from '../api';

export interface AppSetting {
  key: string;
  value: unknown;
  description: string | null;
  updated_at: string | null;
}

export interface Premises {
  pincode: string;
  latitude: number;
  longitude: number;
}

/** How each server-known key is edited. The server validates ranges (PUT /admin/settings/:key). */
export type SettingKind = 'paise' | 'int' | 'number' | 'premises';

export const SETTING_KINDS: Record<string, { kind: SettingKind; label: string; unit?: string }> = {
  'allocation.own_first_min_order_paise': { kind: 'paise', label: 'Own-stock-first minimum order', unit: '₹' },
  'allocation.own_first_max_delivery_hours': { kind: 'int', label: 'Own-stock-first max delivery time', unit: 'hours' },
  'dawabag.premises': { kind: 'premises', label: 'Dawabag premises location' },
  'marketplace.tcs_pct': { kind: 'number', label: 'TCS on partner sales', unit: '%' },
  'marketplace.tds_pct': { kind: 'number', label: 'TDS on partner sales', unit: '%' },
  'marketplace.fee_gst_pct': { kind: 'number', label: 'GST on marketplace fees', unit: '%' },
  'refill.reminder_days_before': { kind: 'int', label: 'Refill reminder lead time', unit: 'days' },
};

export const settingsKeys = { all: ['admin', 'settings'] as const };

export async function fetchSettings(): Promise<AppSetting[]> {
  const { data } = await api.get('/admin/settings');
  return data.data?.settings ?? [];
}

export async function updateSetting(key: string, value: unknown) {
  const { data } = await api.put(`/admin/settings/${encodeURIComponent(key)}`, { value });
  return data.data as { key: string; value: unknown };
}
