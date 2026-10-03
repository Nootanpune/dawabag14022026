// Good Distribution Practice records per batch (Sprint 40; handover D17/D19; C-25). Every
// record and every batch's hold live on the server; a cold-chain excursion holds the batch
// until a pharmacist with a valid registration decides. Staff use /gdp, partners /partner/gdp.
import api from '../api';

export type GdpStatus = 'ok' | 'on_hold' | 'quarantined' | 'destroyed';
export type BatchKind = 'own' | 'partner';
export type ManualKind = 'storage_check' | 'temperature_reading' | 'excursion' | 'transfer' | 'dispatch';
export type Disposition = 'release' | 'quarantine' | 'destroy';

export const GDP_STATUS_LABELS: Record<GdpStatus, string> = {
  ok: 'OK', on_hold: 'On hold — excursion', quarantined: 'Quarantined', destroyed: 'To be destroyed',
};
export const EVENT_LABELS: Record<string, string> = {
  received: 'Received', storage_check: 'Storage check', temperature_reading: 'Temperature reading', excursion: 'Excursion',
  excursion_disposition: 'Pharmacist decision', transfer: 'Transfer', dispatch: 'Dispatch',
};
export const MANUAL_KINDS: ManualKind[] = ['temperature_reading', 'storage_check', 'excursion', 'transfer', 'dispatch'];
export const DISPOSITION_LABELS: Record<Disposition, string> = {
  release: 'Release — fit to sell', quarantine: 'Quarantine — keep held', destroy: 'Destroy',
};
export const COLD_MIN_C = 2;
export const COLD_MAX_C = 8;

export interface GdpBatch {
  kind: BatchKind;
  id: string;
  partner_id: string | null;
  partner_name: string | null;
  product_id: string;
  product_name: string;
  sku: string;
  batch_number: string;
  expiry_date: string;
  location: string | null;
  cold_chain: boolean;
  qty_available: number;
  qty_reserved: number;
  gdp_status: GdpStatus;
  last_record_at: string | null;
}

export interface GdpRecord {
  id: string;
  event_kind: string;
  storage_condition: string | null;
  temperature_c: number | null;
  cold_chain: boolean;
  location: string | null;
  excursion_id: string | null;
  disposition: Disposition | null;
  justification: string | null;
  pharmacist_name: string | null;
  pharmacist_reg_no: string | null;
  stock_adjustment_id: string | null;
  source: string;
  shipment_id: string | null;
  notes: string | null;
  recorded_at: string;
  recorded_by_name: string | null;
  open: boolean;
}

export interface GdpLog {
  batch: GdpBatch & { storage_instructions: string | null };
  records: GdpRecord[];
}

export interface PendingExcursion {
  id: string;
  batch_id: string | null;
  partner_inventory_id: string | null;
  partner_name: string | null;
  product_name: string;
  sku: string;
  batch_number: string;
  temperature_c: number | null;
  notes: string | null;
  source: string;
  recorded_at: string;
  recorded_by_name: string | null;
  batch_gdp_status: GdpStatus;
  qty_available: number;
  last_disposition: Disposition | null;
  hours_waiting: number;
}

export interface EventBody {
  event_kind: ManualKind;
  temperature_c?: number | null;
  storage_condition?: string | null;
  location?: string | null;
  notes?: string | null;
}

export interface DispositionResult {
  id: string;
  disposition: Disposition;
  batch_gdp_status: GdpStatus;
  message: string;
  stock_adjustment: { id: string; adjustment_no: string } | null;
}

export const gdpKeys = {
  all: ['gdp'] as const,
  batches: (scope: string, status: string, q: string, cold: boolean) => ['gdp', 'batches', scope, status, q, cold] as const,
  log: (kind: string, id: string) => ['gdp', 'log', kind, id] as const,
  pending: (scope: string) => ['gdp', 'pending', scope] as const,
};

/** Staff (portal = false) or the partner portal (portal = true). */
const base = (portal: boolean) => (portal ? '/partner/gdp' : '/gdp');

export async function fetchGdpBatches(portal: boolean, f: { scope?: string; status?: string; q?: string; cold?: boolean }): Promise<GdpBatch[]> {
  const { data } = await api.get(`${base(portal)}/batches`, { params: {
    ...(f.scope && !portal ? { scope: f.scope } : {}), ...(f.status ? { status: f.status } : {}), ...(f.q ? { q: f.q } : {}), ...(f.cold ? { cold: '1' } : {}) } });
  return data.data?.batches ?? [];
}

export async function fetchGdpLog(portal: boolean, kind: BatchKind, id: string): Promise<GdpLog> {
  const { data } = await api.get(portal ? `/partner/gdp/batches/${id}` : `/gdp/batches/${kind}/${id}`);
  return data.data;
}

export async function recordGdpEvent(portal: boolean, id: string, body: EventBody) {
  const { data } = await api.post(portal ? `/partner/gdp/batches/${id}/records` : `/gdp/batches/own/${id}/records`, body);
  return data.data as { id: string; event_kind: string; batch_gdp_status: GdpStatus; converted_to_excursion: boolean };
}

export async function fetchPendingExcursions(portal: boolean, scope = 'all'): Promise<PendingExcursion[]> {
  const { data } = await api.get(`${base(portal)}/excursions/pending`, { params: portal ? {} : { scope } });
  return data.data?.excursions ?? [];
}

export async function decideExcursion(portal: boolean, id: string, body: { disposition: Disposition; justification: string; vendor_pharmacist_id?: string }) {
  const { data } = await api.post(`${base(portal)}/excursions/${id}/disposition`, body);
  return data.data as DispositionResult;
}

/** Client mirror of the server's checks (services/gdp/rules.ts). */
export function eventProblem(b: EventBody): string | null {
  if (b.event_kind === 'temperature_reading' && (b.temperature_c === null || b.temperature_c === undefined || Number.isNaN(b.temperature_c))) return 'Enter the temperature read (°C).';
  if (b.event_kind === 'excursion' && (b.notes ?? '').trim().length < 5) return 'Describe the excursion: what happened, for how long, the highest / lowest temperature.';
  if (b.event_kind === 'transfer' && (b.location ?? '').trim().length < 2) return 'Enter where the batch was moved to.';
  return null;
}

export function dispositionProblem(d: Disposition, justification: string): string | null {
  const j = justification.trim();
  if (d === 'release' && j.length < 20) return 'Explain why the batch is still fit to sell (at least 20 characters).';
  if (j.length < 10) return 'Give the reason for this decision (at least 10 characters).';
  return null;
}

/** A cold-chain reading that will be stored as an excursion. */
export const readingIsExcursion = (coldChain: boolean, t: number | null | undefined) =>
  coldChain && t !== null && t !== undefined && !Number.isNaN(t) && (t < COLD_MIN_C || t > COLD_MAX_C);
