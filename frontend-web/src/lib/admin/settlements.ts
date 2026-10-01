import api from '../api';
import type { Settlement, SettlementDetail } from '../marketplace/settlement';

export type PayoutMode = 'NEFT' | 'RTGS' | 'IMPS' | 'UPI';
export const PAYOUT_MODES: PayoutMode[] = ['NEFT', 'RTGS', 'IMPS', 'UPI'];

export const settlementKeys = {
  all: ['admin', 'settlements'] as const,
  list: (status: string) => ['admin', 'settlements', 'list', status] as const,
  detail: (id: string) => ['admin', 'settlements', 'detail', id] as const,
};

export async function fetchSettlements(status?: string): Promise<Settlement[]> {
  const { data } = await api.get('/admin/settlements', { params: status ? { status } : undefined });
  return data.data?.settlements ?? [];
}

export async function fetchSettlement(id: string): Promise<SettlementDetail> {
  const { data } = await api.get(`/admin/settlements/${id}`);
  return data.data;
}

export async function generateSettlements(body: { period_from: string; period_to: string }) {
  const { data } = await api.post('/admin/settlements/generate', body);
  return data.data as {
    period_from: string;
    period_to: string;
    // BIGINT column: the API sends it as a string — convert with Number() before adding
    batches: { id: string; batch_ref: string; net_payable_paise: number | string }[];
  };
}

export async function recordPayout(id: string, body: { payment_mode: PayoutMode; utr_reference: string }) {
  const { data } = await api.post(`/admin/settlements/${id}/pay`, body);
  return data.data as { id: string; payment_status: string };
}
