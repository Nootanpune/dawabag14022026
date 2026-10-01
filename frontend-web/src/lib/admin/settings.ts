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
export type SettingKind = 'paise' | 'int' | 'number' | 'premises' | 'choice' | 'text' | 'boolean';

export interface SettingMeta {
  kind: SettingKind;
  label: string;
  unit?: string;
  /** 'choice' only: the values the server accepts */
  options?: { value: string; label: string }[];
  /** shown under the input, e.g. the allowed range */
  hint?: string;
  /** a blank value saves null (the server reads null as "off") */
  nullable?: boolean;
  /** 'boolean' only: what the confirmation dialog says before switching on / off */
  confirm?: { on: string; off: string };
}

export const SETTING_KINDS: Record<string, SettingMeta> = {
  'allocation.own_first_min_order_paise': { kind: 'paise', label: 'Own-stock-first minimum order', unit: '₹' },
  'allocation.own_first_max_delivery_hours': { kind: 'int', label: 'Own-stock-first max delivery time', unit: 'hours' },
  'dawabag.premises': { kind: 'premises', label: 'Dawabag premises location' },
  'marketplace.tcs_pct': { kind: 'number', label: 'TCS on partner sales', unit: '%' },
  'marketplace.tds_pct': { kind: 'number', label: 'TDS on partner sales', unit: '%' },
  'marketplace.fee_gst_pct': { kind: 'number', label: 'GST on marketplace fees', unit: '%' },
  'refill.reminder_days_before': { kind: 'int', label: 'Refill reminder lead time', unit: 'days' },
  // Sprint 7 — purchasing and stock (C-16, C-28)
  'purchasing.min_shelf_life_days': { kind: 'int', label: 'Minimum shelf life on receipt', unit: 'days', hint: '30–730 days' },
  'stock.near_expiry_days': { kind: 'int', label: 'Near-expiry warning', unit: 'days', hint: '15–365 days' },
  // Sprint 20 — retail free delivery (owner decision: ₹499)
  'delivery.free_above_paise': { kind: 'paise', label: 'Free delivery from', nullable: true,
    hint: 'Retail orders whose medicines (after coupon, before GST) reach this amount are delivered free. Leave blank to switch off. Update the shipping policy to match (C-39).' },
  // Sprint 8 — courier booking
  'courier.provider': {
    kind: 'choice',
    label: 'Courier booking',
    options: [
      { value: 'manual', label: 'Manual — staff type the courier and AWB at dispatch' },
      { value: 'shiprocket', label: 'Shiprocket — book from the dispatch queue' },
    ],
  },
  'courier.pickup_location': { kind: 'text', label: 'Shiprocket pickup location', hint: 'The pickup location name exactly as set up in Shiprocket' },
  // Sprint 9 — GST e-invoicing (C-31): changes when B2B parcels may be dispatched
  'einvoice.enabled': {
    kind: 'boolean',
    label: 'GST e-invoicing (IRN)',
    confirm: {
      on: 'Every new B2B invoice and credit note will be registered with the IRP, and a B2B parcel cannot be dispatched until its invoice IRN is generated. Switch on only once aggregate turnover has crossed the e-invoicing threshold and the legal entity GSTIN, address and premises PIN code are correct.',
      off: 'New B2B invoices will no longer be registered with the IRP and dispatch will not wait for an IRN. Switch off only if Dawabag is below the e-invoicing threshold.',
    },
  },
  // Sprint 12 — opening stock by catalogue import closes at go-live (C-46)
  'catalogue.opening_stock_open': {
    kind: 'boolean',
    label: 'Opening stock by catalogue import',
    confirm: {
      on: 'Re-open opening stock: catalogue imports may again add stock without a goods receipt. Do this only before go-live.',
      off: 'Close opening stock at go-live: afterwards stock enters only by goods receipt.',
    },
  },
};

/** Edited in its own section (table of DLT templates), not the generic list */
export const DLT_TEMPLATES_KEY = 'sms.dlt_templates';

export const settingsKeys = { all: ['admin', 'settings'] as const };

export async function fetchSettings(): Promise<AppSetting[]> {
  const { data } = await api.get('/admin/settings');
  return data.data?.settings ?? [];
}

export async function updateSetting(key: string, value: unknown) {
  const { data } = await api.put(`/admin/settings/${encodeURIComponent(key)}`, { value });
  return data.data as { key: string; value: unknown };
}
