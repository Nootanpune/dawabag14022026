// Complaints (grievance redressal) — Rulebook C-36. The server computes the
// acknowledge (48 h) and resolve (30 day) deadlines and overdue flags.
import api from '../api';

export const GRIEVANCE_CATEGORIES = [
  { value: 'order', label: 'Order' },
  { value: 'delivery', label: 'Delivery' },
  { value: 'product_quality', label: 'Product quality' },
  { value: 'refund', label: 'Refund' },
  { value: 'prescription', label: 'Prescription' },
  { value: 'privacy', label: 'Privacy / personal data' },
  { value: 'pricing', label: 'Pricing' },
  { value: 'other', label: 'Other' },
] as const;

export type GrievanceCategory = (typeof GRIEVANCE_CATEGORIES)[number]['value'];
export type GrievanceStatus = 'open' | 'acknowledged' | 'in_progress' | 'resolved' | 'closed';

export interface GrievanceSummary {
  id: string;
  ticket_no: string;
  category: GrievanceCategory;
  subject: string;
  status: GrievanceStatus;
  order_id: string | null;
  order_number: string | null;
  created_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
  ack_overdue: boolean;
  resolution_overdue: boolean;
  ack_due_at: string;
  resolve_due_at: string;
  buyer_name?: string | null;
}

export interface GrievanceMessage {
  id: string;
  from_staff: boolean;
  body: string;
  created_at: string;
  author: string | null;
}

export interface GrievanceDetail extends GrievanceSummary {
  description: string;
  resolution: string | null;
  messages: GrievanceMessage[];
}

export interface NewGrievance {
  category: GrievanceCategory;
  subject: string;
  description: string;
  order_id?: string;
}

export const grievanceKeys = {
  mine: ['grievances', 'mine'] as const,
  all: (status: string, overdue: boolean) => ['grievances', 'all', status, overdue] as const,
  one: (id: string) => ['grievances', 'one', id] as const,
};

export function categoryLabel(c: string): string {
  return GRIEVANCE_CATEGORIES.find((x) => x.value === c)?.label ?? c;
}

export async function fetchMyGrievances(): Promise<GrievanceSummary[]> {
  const { data } = await api.get('/grievances');
  return data.data?.grievances ?? [];
}

export async function createGrievance(body: NewGrievance) {
  const { data } = await api.post('/grievances', body);
  return data.data as { id: string; ticket_no: string };
}

export async function fetchGrievance(id: string): Promise<GrievanceDetail> {
  const { data } = await api.get(`/grievances/${id}`);
  return data.data;
}

/** Buyer or staff reply; the first staff reply acknowledges the complaint. */
export async function postGrievanceMessage(id: string, body: string): Promise<GrievanceDetail> {
  const { data } = await api.post(`/grievances/${id}/messages`, { body });
  return data.data;
}

// ── Staff ──
export async function fetchAllGrievances(status: string, overdueOnly: boolean): Promise<GrievanceSummary[]> {
  const params: Record<string, string> = {};
  if (status) params.status = status;
  if (overdueOnly) params.overdue = 'true';
  const { data } = await api.get('/grievances/admin/all', { params });
  return data.data?.grievances ?? [];
}

export async function setGrievanceStatus(id: string, status: 'in_progress' | 'resolved' | 'closed', resolution?: string) {
  const { data } = await api.patch(`/grievances/${id}/status`, { status, ...(resolution ? { resolution } : {}) });
  return data.data;
}
