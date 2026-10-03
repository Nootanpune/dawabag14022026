// Emergency stop for prescription-medicine sales (owner decision 2026-10-03; Sprint 38).
// The state lives on the server only; pages ask for it on every load (no local copy).
import api from '../api';

export interface SalesStatus {
  rx_sales: 'open' | 'paused';
  message: string | null;
  reference: string | null;
  since: string | null;
}
export interface PauseState {
  paused: boolean;
  reason?: string;
  reference?: string;
  public_message?: string | null;
  paused_by?: string;
  paused_at?: string;
}
export interface PauseHistoryRow {
  action: 'rx_sales_paused' | 'rx_sales_resumed';
  created_at: string;
  by_name: string | null;
  new_value: { reason?: string; reference?: string } | null;
  old_value: { reason?: string; reference?: string } | null;
  notes: string | null;
}

export const emergencyKeys = {
  public: ['sales-status'] as const,
  admin: ['admin', 'emergency-stop'] as const,
};

export async function fetchSalesStatus(): Promise<SalesStatus> {
  const { data } = await api.get('/sales-status');
  return data.data;
}
export async function fetchEmergencyStop(): Promise<{ state: PauseState; public: SalesStatus; history: PauseHistoryRow[] }> {
  const { data } = await api.get('/admin/emergency-stop');
  return data.data;
}
export async function pauseRxSales(body: { reason: string; reference: string; public_message?: string; confirm: 'PAUSE' }) {
  const { data } = await api.post('/admin/emergency-stop/pause', body);
  return data.data;
}
export async function resumeRxSales(body: { note?: string; confirm: 'RESUME' }) {
  const { data } = await api.post('/admin/emergency-stop/resume', body);
  return data.data;
}
