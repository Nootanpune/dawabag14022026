// Returns, refunds and credit notes (Rulebook C-37). Returned medicines are
// never restocked; approval, refund amount and credit note are decided by the
// server. Credit-note PDFs are rendered per request and never stored here.
import api from '../api';
import { downloadFromApi } from '../download';

export const RETURN_REASONS = [
  { value: 'damaged', label: 'Damaged or seal broken', quick: true },
  { value: 'wrong_item', label: 'Wrong item', quick: true },
  { value: 'missing_item', label: 'Item missing', quick: true },
  { value: 'expired', label: 'Expired', quick: false },
  { value: 'near_expiry', label: 'Too close to expiry', quick: false },
  { value: 'quality_issue', label: 'Quality issue', quick: false },
  { value: 'recalled', label: 'Recalled batch', quick: false },
] as const;

export type ReturnReason = (typeof RETURN_REASONS)[number]['value'];
export type ReturnStatus = 'requested' | 'approved' | 'rejected' | 'closed';
export type Disposition = 'destroyed' | 'returned_to_supplier' | 'not_collected';

export const DISPOSITIONS: { value: Disposition; label: string }[] = [
  { value: 'destroyed', label: 'Destroyed' },
  { value: 'returned_to_supplier', label: 'Returned to supplier' },
  { value: 'not_collected', label: 'Not collected from buyer' },
];

export function returnReasonLabel(r: string): string {
  return RETURN_REASONS.find((x) => x.value === r)?.label ?? r.replace(/_/g, ' ');
}

export interface ReturnSummary {
  id: string;
  return_no: string;
  order_id: string;
  order_number: string;
  shipment_id: string;
  seller_type: string;
  partner_name: string | null;
  reason: ReturnReason;
  description: string;
  status: ReturnStatus;
  refund_paise: number;
  decision_notes: string | null;
  disposition: Disposition | null;
  created_at: string;
  decided_at: string | null;
  buyer_name: string | null;
}

export interface ReturnItem {
  order_item_id: string;
  quantity: number;
  product_name: string;
  delivered_qty: number;
  line_total_paise: number;
  batch_number: string | null;
  expiry_date: string | null;
}

export interface ReturnDetail extends ReturnSummary {
  items: ReturnItem[];
  credit_notes: { credit_note_number: string; total_paise: number; created_at: string }[];
  refunds: { method: string; amount_paise: number; status: string; processed_at: string | null }[];
}

export interface Refund {
  id: string;
  order_id: string;
  order_number: string;
  return_id: string | null;
  source: string;
  method: string;
  amount_paise: number;
  status: 'pending' | 'processed' | 'failed';
  gateway_refund_id: string | null;
  reference: string | null;
  failure_reason: string | null;
  created_at: string;
  processed_at: string | null;
}

export interface NewReturn {
  shipment_id: string;
  reason: ReturnReason;
  description: string;
  items: { order_item_id: string; quantity: number }[];
}

export const returnKeys = {
  all: ['returns'] as const,
  mine: ['returns', 'mine'] as const,
  one: (id: string) => ['returns', 'one', id] as const,
  staff: (status: string) => ['returns', 'staff', status] as const,
  myRefunds: ['returns', 'refunds', 'mine'] as const,
  adminRefunds: (status: string) => ['returns', 'refunds', 'admin', status] as const,
  partner: ['returns', 'partner'] as const,
  partnerOne: (id: string) => ['returns', 'partner', id] as const,
};

// ── Buyer ──
export async function createReturn(body: NewReturn) {
  const { data } = await api.post('/returns', body);
  return data.data as { id: string; return_no: string; status: ReturnStatus };
}

export async function fetchMyReturns(): Promise<ReturnSummary[]> {
  const { data } = await api.get('/returns');
  return data.data?.returns ?? [];
}

export async function fetchReturn(id: string): Promise<ReturnDetail> {
  const { data } = await api.get(`/returns/${id}`);
  return data.data;
}

export async function fetchMyRefunds(): Promise<Refund[]> {
  const { data } = await api.get('/returns/refunds/my');
  return data.data?.refunds ?? [];
}

/** GET /invoices/credit-notes/:id.pdf through the signed-in client (C-37). */
export function downloadCreditNote(creditNoteId: string, number?: string | null) {
  return downloadFromApi(`/invoices/credit-notes/${creditNoteId}.pdf`, `${(number ?? 'credit-note').replace(/[\\/]/g, '-')}.pdf`);
}

// ── Staff ──
export async function fetchStaffReturns(status: string): Promise<ReturnSummary[]> {
  const { data } = await api.get('/returns/admin/all', { params: status ? { status } : {} });
  return data.data?.returns ?? [];
}

export async function decideReturn(id: string, approve: boolean, notes: string) {
  const { data } = await api.post(`/returns/${id}/decide`, { approve, notes });
  return data.data as { id: string; status: string; refund_paise: number; credit_note_number: string | null };
}

export async function closeReturn(id: string, disposition: Disposition) {
  const { data } = await api.post(`/returns/${id}/close`, { disposition });
  return data.data as { id: string; status: string; disposition: Disposition };
}

// ── Accounts ──
export async function fetchAdminRefunds(status: string): Promise<Refund[]> {
  const { data } = await api.get('/returns/refunds/admin', { params: status ? { status } : {} });
  return data.data?.refunds ?? [];
}

export async function markRefundProcessed(id: string, reference: string) {
  const { data } = await api.post(`/returns/refunds/admin/${id}/processed`, { reference });
  return data.data as { id: string; status: string };
}

// ── Partner (read-only) ──
export async function fetchPartnerReturns(): Promise<ReturnSummary[]> {
  const { data } = await api.get('/partner/returns');
  return data.data?.returns ?? [];
}

export async function fetchPartnerReturn(id: string): Promise<ReturnDetail> {
  const { data } = await api.get(`/partner/returns/${id}`);
  return data.data;
}
