// Online-sale status per product (Sprint 39, owner decision 2026-10-03; C-10). The status
// lives on the server only; a pharmacist allows (with a dated reference), pharmacists and
// admins stop. Buyers only ever see products that are 'permitted'.
import api from '../api';

export type OnlineSaleStatus = 'permitted' | 'restricted' | 'prohibited';

export const ONLINE_SALE_LABELS: Record<OnlineSaleStatus, string> = {
  permitted: 'Allowed online',
  restricted: 'Not allowed online yet',
  prohibited: 'Prohibited online',
};

export interface OnlineSaleRow {
  id: string;
  name: string;
  sku: string;
  drug_schedule: string;
  is_active: boolean;
  catalogue_state: string;
  online_sale_status: OnlineSaleStatus;
  online_sale_ref: string | null;
  online_sale_ref_date: string | null;
  online_sale_reason: string | null;
  online_sale_set_at: string | null;
  online_sale_set_by_name: string | null;
}

export interface OnlineSaleChange {
  status: OnlineSaleStatus;
  notification_ref?: string | null;
  notification_date?: string | null;
  reason?: string | null;
}

export interface OnlineSaleLogRow {
  old_status: OnlineSaleStatus | null;
  new_status: OnlineSaleStatus;
  notification_ref: string | null;
  notification_date: string | null;
  reason: string | null;
  set_at: string;
  set_by_name: string | null;
}

export const NEVER_ONLINE_SCHEDULES = ['Schedule X', 'NDPS'];

export const onlineSaleKeys = {
  all: ['online-sale'] as const,
  list: (status: string, q: string) => ['online-sale', 'list', status, q] as const,
  log: (id: string) => ['online-sale', 'log', id] as const,
};

export async function fetchOnlineSale(status: OnlineSaleStatus | '', q: string) {
  const { data } = await api.get('/online-sale/products', { params: { ...(status ? { status } : {}), ...(q ? { q } : {}) } });
  return data.data as { products: OnlineSaleRow[]; counts: { online_sale_status: OnlineSaleStatus; n: number }[] };
}

export async function setOnlineSale(productIds: string[], change: OnlineSaleChange) {
  const { data } = productIds.length === 1
    ? await api.put(`/online-sale/products/${productIds[0]}`, change)
    : await api.post('/online-sale/products/bulk', { product_ids: productIds, ...change });
  return data.data as { updated: number; status: OnlineSaleStatus };
}

export async function fetchOnlineSaleLog(productId: string) {
  const { data } = await api.get(`/online-sale/products/${productId}/log`);
  return data.data as OnlineSaleLogRow[];
}

/** What is missing before the change can be sent (the server checks the same). */
export function changeProblems(c: OnlineSaleChange, isPharmacist: boolean, today: string): string | null {
  if (c.status === 'permitted') {
    if (!isPharmacist) return 'Only a Dawabag pharmacist may allow a product for online sale.';
    if ((c.notification_ref ?? '').trim().length < 3) return 'Enter the notification or approval reference.';
    if (!c.notification_date) return 'Enter the date of that notification.';
    if (c.notification_date > today) return 'The notification date cannot be in the future.';
    return null;
  }
  if ((c.reason ?? '').trim().length < 5) return 'Say why it is not allowed online (at least 5 characters).';
  return null;
}
