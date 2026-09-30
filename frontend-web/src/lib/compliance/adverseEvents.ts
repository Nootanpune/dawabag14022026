// Side-effect (adverse drug reaction) reports — Rulebook C-29. The pharmacist
// reviews and forwards them to PvPI; serious reports are due sooner. Deadlines
// and overdue flags come from the server.
import api from '../api';

export const SERIOUSNESS = [
  { value: 'non_serious', label: 'Not serious' },
  { value: 'hospitalised', label: 'Needed hospital care' },
  { value: 'life_threatening', label: 'Life-threatening' },
  { value: 'disability', label: 'Caused lasting disability' },
  { value: 'death', label: 'Death' },
  { value: 'other_serious', label: 'Other serious' },
] as const;

export const OUTCOMES = [
  { value: 'recovered', label: 'Recovered' },
  { value: 'recovering', label: 'Recovering' },
  { value: 'not_recovered', label: 'Not recovered' },
  { value: 'fatal', label: 'Fatal' },
  { value: 'unknown', label: 'Unknown' },
] as const;

export type Seriousness = (typeof SERIOUSNESS)[number]['value'];
export type Outcome = (typeof OUTCOMES)[number]['value'];
export type AdrStatus = 'new' | 'reviewed' | 'forwarded' | 'closed';

export const labelOf = (list: readonly { value: string; label: string }[], v: string | null | undefined) =>
  list.find((x) => x.value === v)?.label ?? v ?? '—';

export interface NewAdr {
  product_id: string;
  order_id?: string;
  batch_number?: string;
  patient_initials: string;
  patient_age_years?: number;
  patient_gender?: 'male' | 'female' | 'other';
  reaction: string;
  onset_date?: string;
  seriousness: Seriousness;
  outcome?: Outcome;
}

export interface AdrSummary {
  id: string;
  report_no: string;
  product_id: string;
  product_name: string;
  batch_number: string | null;
  seriousness: Seriousness;
  status: AdrStatus;
  pvpi_reference: string | null;
  created_at: string;
  forward_due_at?: string;
  overdue?: boolean;
}

export interface AdrDetail extends AdrSummary {
  order_id: string | null;
  order_number: string | null;
  patient_initials: string;
  patient_age_years: number | null;
  patient_gender: string | null;
  reaction: string;
  onset_date: string | null;
  outcome: Outcome | null;
  pharmacist_notes: string | null;
  reviewed_at: string | null;
  forwarded_at: string | null;
}

export const adrKeys = {
  all: ['adr'] as const,
  mine: ['adr', 'mine'] as const,
  one: (id: string) => ['adr', 'one', id] as const,
  staff: (status: string) => ['adr', 'staff', status] as const,
};

export async function createAdr(body: NewAdr) {
  const { data } = await api.post('/compliance/adverse-events', body);
  return data.data as { id: string; report_no: string; status: AdrStatus };
}

export async function fetchMyAdrs(): Promise<AdrSummary[]> {
  const { data } = await api.get('/compliance/adverse-events');
  return data.data?.reports ?? [];
}

export async function fetchAdr(id: string): Promise<AdrDetail> {
  const { data } = await api.get(`/compliance/adverse-events/${id}`);
  return data.data;
}

export async function fetchStaffAdrs(status: string): Promise<AdrSummary[]> {
  const { data } = await api.get('/compliance/adverse-events/admin/all', { params: status ? { status } : {} });
  return data.data?.reports ?? [];
}

/** pvpi_reference is required when forwarding to PvPI. */
export async function reviewAdr(id: string, body: { status: Exclude<AdrStatus, 'new'>; notes: string; pvpi_reference?: string }) {
  const { data } = await api.patch(`/compliance/adverse-events/${id}`, body);
  return data.data;
}
