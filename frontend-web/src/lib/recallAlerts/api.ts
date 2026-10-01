// Regulator recall / NSQ alerts (admin/super_admin) — Rulebook C-28. All state is on
// the server (/api/v1/recalls/alerts); an uploaded list stays in the in-memory File
// and the server reads it from memory too (standing rule: nothing stored locally).
import api from '../api';
import type { AlertCreated, AlertDetail, AlertLineInput, AlertSource, AlertSummary } from './types';

export const recallAlertKeys = {
  all: ['recall-alerts'] as const,
  list: (open: boolean) => ['recall-alerts', 'list', open] as const,
  one: (id: string) => ['recall-alerts', id] as const,
};

export interface AlertHeaderBody {
  source: AlertSource;
  reference: string;
  /** ISO with offset */
  received_at: string;
}

export async function fetchAlerts(open: boolean): Promise<AlertSummary[]> {
  const { data } = await api.get('/recalls/alerts', { params: { open: open ? 'true' : 'false' } });
  return data.data?.alerts ?? [];
}

export async function fetchAlert(id: string): Promise<AlertDetail> {
  const { data } = await api.get(`/recalls/alerts/${id}`);
  return data.data;
}

/** Multipart upload of a CDSCO / FDA / manufacturer list (.xlsx or .csv, ≤ 5 MB). */
export async function importAlert(file: File, header: AlertHeaderBody): Promise<AlertCreated> {
  const f = new FormData();
  f.append('source', header.source);
  f.append('reference', header.reference);
  f.append('received_at', header.received_at);
  f.append('file', file);
  const { data } = await api.post('/recalls/alerts/import', f, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
  });
  return data.data;
}

/** Lines typed in from an FDA email or a manufacturer letter. */
export async function createAlert(body: AlertHeaderBody & { lines: AlertLineInput[] }): Promise<AlertCreated> {
  const { data } = await api.post('/recalls/alerts', body);
  return data.data;
}

/** Recall our batches for this match: blocks stock and notifies buyers. */
export async function recallMatch(matchId: string) {
  const { data } = await api.post(`/recalls/alerts/matches/${matchId}/recall`);
  return data.data as { id: string; decision: 'recalled'; recall_id: string | null };
}

/** "Not this product" — same batch number, different drug or maker. */
export async function clearMatch(matchId: string, notes: string) {
  const { data } = await api.post(`/recalls/alerts/matches/${matchId}/clear`, { notes });
  return data.data as { id: string; decision: 'cleared' };
}

/** Clear a product for a line after a goods receipt was refused for it. */
export async function clearLineProduct(lineId: string, productId: string, notes: string) {
  const { data } = await api.post(`/recalls/alerts/lines/${lineId}/clear`, { product_id: productId, notes });
  return data.data as { id: string; decision: 'cleared' };
}
