// Stock control — /api/v1/stock/*. Every stock change outside sales and goods
// receipts needs a reason and a second person's approval (C-46); expired,
// damaged and recalled write-offs form the destruction register (C-28, C-34).
import api from '../api';
import { downloadFromApi } from '../download';
import type {
  Adjustment,
  AdjustmentStatus,
  Batch,
  BatchPage,
  DisposalMethod,
  ExpiryFilter,
  NewAdjustment,
  StockCount,
  StockCountDetail,
} from './types';

export const stockControlKeys = {
  batches: (q: string, expiry: ExpiryFilter | '', recalled: boolean, page: number) => ['stock', 'batches', q, expiry, recalled, page] as const,
  /** a supplier's batches, or every recalled batch, for a purchase return (C-28) */
  returnable: (vendorId: string, recalled: boolean) => ['stock', 'batches', 'returnable', vendorId, recalled] as const,
  adjustments: (status: AdjustmentStatus | '') => ['stock', 'adjustments', status] as const,
  destruction: (pending: boolean) => ['stock', 'adjustments', 'destruction', pending] as const,
  counts: ['stock', 'counts'] as const,
  count: (id: string) => ['stock', 'counts', id] as const,
};

const S = '/stock';
export const BATCH_PAGE_SIZE = 50;

/** One page of batches plus the server's total; recalled=true lists only recalled batches still in stock (C-28). */
export async function fetchBatches(q: string, expiry: ExpiryFilter | '', recalled: boolean, page: number): Promise<BatchPage> {
  const { data } = await api.get(`${S}/batches`, {
    params: { q: q || undefined, expiry: expiry || undefined, recalled: recalled ? 'true' : undefined, page, limit: BATCH_PAGE_SIZE },
  });
  const d = data.data ?? {};
  return { batches: d.batches ?? [], total: Number(d.total ?? 0) };
}

/** Batches that can go back on a purchase return: this supplier's, or all recalled stock (up to 200). */
export async function fetchReturnableBatches(vendorId: string, recalled: boolean): Promise<Batch[]> {
  const { data } = await api.get(`${S}/batches`, {
    params: recalled ? { recalled: 'true', limit: 200 } : { vendor_id: vendorId, limit: 200 },
  });
  return data.data?.batches ?? [];
}

export async function fetchAdjustments(status: AdjustmentStatus | ''): Promise<Adjustment[]> {
  const { data } = await api.get(`${S}/adjustments`, { params: status ? { status } : undefined });
  return data.data?.adjustments ?? [];
}

export async function requestAdjustment(body: NewAdjustment): Promise<{ id: string; adjustment_no: string }> {
  const { data } = await api.post(`${S}/adjustments`, body);
  return data.data;
}

/** Admin decision; the server returns 403 when the approver raised the request (two-person rule, C-46). */
export async function decideAdjustment(id: string, approve: boolean, notes: string) {
  await api.post(`${S}/adjustments/${id}/decide`, { approve, notes });
}

export async function recordDisposal(id: string, body: { method: DisposalMethod; reference: string; witness: string }) {
  await api.post(`${S}/adjustments/${id}/disposal`, body);
}

export async function fetchDestructionRegister(pending: boolean): Promise<Adjustment[]> {
  const { data } = await api.get(`${S}/destruction-register`, { params: { pending: String(pending) } });
  return data.data?.entries ?? [];
}

/** CSV for the inspector (C-28, C-34), built by the server on each request and saved straight from the response. */
export function downloadDestructionCsv(pending: boolean) {
  return downloadFromApi(`${S}/destruction-register`, `destruction-register${pending ? '-pending' : ''}.csv`, {
    format: 'csv',
    ...(pending ? { pending: 'true' } : {}),
  });
}

export async function fetchCounts(): Promise<StockCount[]> {
  const { data } = await api.get(`${S}/counts`);
  return data.data?.counts ?? [];
}

export async function startCount(body: { label: string; product_ids?: string[]; storage_location?: string }) {
  const { data } = await api.post(`${S}/counts`, body);
  return data.data as { id: string; count_no: string; lines: number };
}

export async function fetchCount(id: string): Promise<StockCountDetail> {
  const { data } = await api.get(`${S}/counts/${id}`);
  return data.data;
}

export async function saveCountLines(id: string, lines: { batch_id: string; counted_qty: number }[]) {
  await api.put(`${S}/counts/${id}/lines`, { lines });
}

export async function submitCount(id: string) {
  await api.post(`${S}/counts/${id}/submit`);
}

/** Admin, never the counter (C-46); each variance becomes an approved adjustment. */
export async function approveCount(id: string): Promise<{ variances: number }> {
  const { data } = await api.post(`${S}/counts/${id}/approve`);
  return data.data;
}
